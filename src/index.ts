import * as net from "net";
import * as fs from "fs";
import { HTTPReq } from "./types.js";
import { parseRequest } from "./helpers.js";

const PORT = 3000;

const server = net.createServer((socket: net.Socket) => {
  // when the data event is emitted, take the data from the buffer
  // create a string from it, and log it on the console
  socket.on("data", (buffer) => {
    const requestString = buffer.toString("utf-8");
    const request: HTTPReq = parseRequest(requestString);
    console.log(request.method, request.path, request.protocol);

    // on receiving a GET request,
    // check if the request file exists
    switch (request.method) {
      case "GET":
        // if file exists, send back 200 OK
        if (fs.existsSync(`.${request.path}`)) {
          socket.write("HTTP/1.0 200 OK");
        } else {
          socket.write("HTTP/1.0 400 NOT FOUND");
        }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
