# journal, building an http-server

## http overview

there are many protocols that can be used to transfer data over a network, and
one of them is http, which is built on top of the tcp protocol. http is an
application layer protocol, while tcp is a transport layer protocol. http 1.0
allowed only a single request in a connection, so it wasn't very practical, but
http 1.1 fixed this.

the `nc` command creates a tcp connection to the destination host and port, and
then attaches the connection to the stdin and stdout.

```bash
nc example.com 80 <request.txt
```

there's a modern replacement of `nc`, `socat`:

```bash
socat tcp:example.com:80 -
```

there's also the `telnet` command.

```bash
telnet example.com 80
```

the `curl` command uses an existing HTTP client. note that the `-vvv` flag is
used to show the request and response headers.

```bash
curl -vvv example.com
```

https adds TLS between HTTP and TCP. since the data is encrypted, you can't use
`netcat`, and instead replace it with a TLS client:

```bash
openssl s_client -verify_quiet -quiet -connect example.com:443
```

## tcp

with UDP, each read from a socket corresponds to a single write from the peer.
with TCP, data is a continuous flow of bytes.

with TCP, data is encapsulated as one or more IP packets, and IP boundaries have
no relationship to the original write boundaries. the send buffer stores the
data before transmission, where multiple writes are indistinguishable from a
single write, and the receive buffer stores data as it's made immediately
abailable to the application.

to solve the following problems:

- what if the message exceeds the capacity of a single packet?
- what if the packet is lost?
- out-of-order packets?

tcp offers

- byte streams instead of packets
- reliable and ordered delivery

tcp connections begin with a handshake

- server waits for a client at a specific address (IP + port) during a step
  called _bind and listen_
- the connect operation involves a 3-step handshake (SYN, SYN-ACK, ACK)
- after the ACK, the connection can be accepted by the server

tcp allows bidirectional and full-duplex byte streams, which means that both the
client and server can send data at the same time. some protocols are
request-response, such as HTTP/1.1, while others, such as WebSockets, are
full-duplex.

tcp connections are terminated with 2 handshakes. one side sends the FIN flag,
and the other side ACKs the FIN. each direction of channels can be terminated
independently, so the other side also performs the same handshake to close the
connection. the socket can then be recycled.

## sockets

sockets are like pipes that connect two processes. over the network, sockets
enable communication between two hosts. applications refer to sockets by
abstract os handles. in node.js, the socket api is wrapped with JS objects with
methods on them.

two types of socket handles:

- listening sockets: obtained by listening on an address
  - bind & listen
  - accept
  - close
- connection sockets: obtained by accepting a client connection from a listening
  socket
  - read
  - write
  - close

## socket api in node.js

in node.js, you can create a listening socket with the `net` module:

```javascript
import * as net from "net";
```

different sockets are represented as different objects. the `net.createServer()`
function creates a listening socket, whose type is `net.Server`. the
`net.Server` has a `listen()` method to bind and listen on an address`:

```javascript
const server = net.createServer();
server.listen({
  host: "127.0.0.1",
  port: 1234,
});
```

the `net.Server` object has an `on()` method to listen for events. the
`connection` event is emitted when a client connects to the server:

```typescript
function onConnection(socket: net.Socket): void {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  // ...
}

let server = net.createServer();
server.on("connection", onConnection);
server.listen({
  host: "127.0.0.1",
  port: 1234,
});
```

there are other events, on which you can register callbacks. for example, the
error event is invoked when an error occurs.

```typescript
server.on("error", (err: Error) => {
  throw err;
});
```

[node.js documentation on the `net module](https://nodejs.org/api/net.html#class-netserver)

data received from the connection is also delivered via callbacks.

```typescript
soncet.on("end", () => {
  // FIN received
  console.log("client disconnected");
});

socket.on("data", (data: Buffer) => {
  console.log("received", data);
  socket.write(data); // sends data back to the peer
});
```

transmission is ended and socket is closed using the `socket.end()` method.

```typescript
if (data.toString() === "quit\n") {
  socket.end();
}
```

full example code:

```typescript
import * as net from "net";
function newConn(socket: net.Socket): void {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  socket.on("end", () => {
    // FIN received. The connection will be closed automatically. console.log('EOF.');
  });
  socket.on("data", (data: Buffer) => {
    console.log("data:", data);
    socket.write(data); // echo back the data.
    // actively closed the connection if the data contains 'q'
    if (data.includes("q")) {
      console.log("closing.");
      socket.end(); // this will send FIN and close the connection.
    }
  });
}
let server = net.createServer();
server.on("error", (err: Error) => {
  throw err;
});
server.on("connection", newConn);
server.listen({ host: "127.0.0.1", port: 1234 });
```

each direction of a tcp connection is ended independently. a half-closed
connection between A and B means that

- A cannot send any more data but can still receive from B
- B gets EOF, but can still send to A

in node.js, to enable half-open sockets, enable the `allowHalfOpen` option:

```typescript
let server = net.createServer({ allowHalfOpen: true });
```

now `socket.end()` no longer closes the connection, but only sends EOF. use
`socket.destroy()` to close the connection.

## http semantics and syntax

an http request message consts of

- the method
- the URI
- a list of key-value header fields
- a payload body

an http response consists of

- a status code
- a list of header fields
- an optional payload body

### content length

the header and body are separated by an empty line, so the header ends with
`\r\n\r\n`.

the length of the body can be determined by the `Content-Length` header field,
but some older HTTP/1.0 software do not use `Content-Length`. in this caes, the
parser reads the socket until the EOF is encountered.

### chunked encoding

`Transfer-Encoding: chunked` can be used instead of `Content-Length`. this
allows the server to send the response while generating it on the fly. this is
called streaming.

although the sender won't know the total payload length in advance, it does knoe
the portion of the payload that it's sending, so it can send it in a
mini-message format called a "chunk", and a special chunk marks the end of end
stream. the application sees the payload as a continuous stream of bytes, and
not as a series of chunks.

the receiver parses the byte stream into chunks and consumes the data, until the
special chunk is received.

```http
4\r\nHTTP\r\n5\r\nserver\r\n0\r\n\r\n
```

each chunk starts with the size of the data, and the 0-sized chunk marks the end
of the stream. for example, the above message is parsed into three chunks:

- 4\r\nHTTP\r\n
- 5\r\nserver\r\n
- 0\r\n\r\n

### http methods

| Verb     | Safe | Idempotent | Cacheable | `<form>` | CRUD   | Req body | Res body |
| -------- | ---- | ---------- | --------- | -------- | ------ | -------- | -------- |
| `GET`    | Yes  | Yes        | Yes       | Yes      | read   | No       | Yes      |
| `HEAD`   | Yes  | Yes        | Yes       | No       | read   | No       | No       |
| `POST`   | No   | No         | No\*      | Yes      | \-     | Yes      | Yes      |
| `PATCH`  | No   | No         | No\*      | No       | update | Yes      | May      |
| `PUT`    | No   | Yes        | No        | No       | create | Yes      | May      |
| `DELETE` | No   | Yes        | No        | No       | delete | May      | May      |

### text vs binary

because http/1.1 is a text-based protocol, it takes the machine extra work to interpret it. writing code is not simple because there are many rules for interpreting it, and you need to know the length of the string, as indicated by delimiters. http/2 is binary and more complex than http/1.1, but parsing the protocol is easier because you don't have to deal with elements of unknown length.

if a malicious client can trick a buggy server into emitting a header field with CRLF (`\r\n`) in it, and the header field is the last field, then the payload body can be injected into the response. this is called an HTTP response splitting attack.

a proper http server/client must forbid CRLF in header fields. in JSON, a string can contain arbitrary characters, so strings are quoted to avoid ambiguity, but the quotes themselves are also delimiters, so escape sequences are used to represent the quotes themselves.

a better and simpler alternative is to use length-prefixed data, that is, to specify the length of the element before the element data. some examples are:

- chunked transfer encoding: length itself is still delimited
- websocket frame format: no delimiters at all
- HTTP/2: frame based
- the MessagePack serialization format: some kind of binary JSON

