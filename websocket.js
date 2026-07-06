const express = require("express");
const server = require("http").createServer();
const app = express();

app.get("/", function (req, res) {
  res.sendFile("index.html", { root: __dirname });
});

server.on("request", app);
server.listen(3000, function () {
  console.log("server started on port 3000");
});

/** Begin websocket */
const WebSocketServer = require("ws").Server;

const wss = new WebSocketServer({ server: server });
const sqlite = require("sqlite3").verbose();
const db = new sqlite.Database(":memory:");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS visitors (
      count INTEGER,
      time TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      message TEXT NOT NULL,
      time TEXT NOT NULL
    )
  `);
});

process.on("SIGINT", () => {
  console.log("sigint");
  wss.clients.forEach(function each(client) {
    client.close();
  });
  server.close(() => {
    shutdownDB();
  });
});

wss.on("connection", function connection(ws) {
  const numClients = wss.clients.size;
  console.log("Clients connected", numClients);

  wss.broadcast(
    JSON.stringify({ type: "system", text: `Current visitors: ${numClients}` }),
  );

  if (ws.readyState === ws.OPEN) {
    ws.send(
      JSON.stringify({
        type: "system",
        text: "Welcome to my server",
        visitors: numClients,
      }),
    );
  }

  db.run(`INSERT INTO visitors (count, time)
        VALUES (${numClients}, datetime('now'))
    `);

  db.all(
    `SELECT name, message, time FROM messages ORDER BY id DESC LIMIT 50`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return;
      }

      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "history",
            messages: rows.reverse(),
          }),
        );
      }
    },
  );

  ws.on("message", function incoming(data) {
    let payload;

    try {
      payload = JSON.parse(data.toString());
    } catch (error) {
      payload = { type: "message", text: data.toString() };
    }

    if (!payload || payload.type !== "message") {
      return;
    }

    const name =
      String(payload.name || "Anonymous")
        .trim()
        .slice(0, 32) || "Anonymous";
    const message = String(payload.text || "").trim();

    if (!message) {
      return;
    }

    db.run(
      `INSERT INTO messages (name, message, time) VALUES (?, ?, datetime('now'))`,
      [name, message],
      function onInsert(err) {
        if (err) {
          console.error(err);
          return;
        }

        const chatMessage = {
          type: "message",
          id: this.lastID,
          name,
          text: message,
          time: new Date().toISOString(),
        };

        wss.broadcast(JSON.stringify(chatMessage));
      },
    );
  });

  ws.on("close", function close() {
    wss.broadcast(
      JSON.stringify({
        type: "system",
        text: `Current visitors: ${wss.clients.size}`,
      }),
    );
    console.log("A client has disconnected");
  });
});

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

/** end websockets */
/** begin database */
function getCounts() {
  db.each("SELECT * FROM visitors", (err, row) => {
    console.log(row);
  });
}

function shutdownDB() {
  console.log("Shutting down db");

  getCounts();
  db.close();
}
