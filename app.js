const http = require('http')

const server =http.createServer(function(req,res){
		res.write('teri mkc')
		res.end()}).listen(3000)
