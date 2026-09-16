import net from "node:net";

const listenPort = 9223;
const targetPort = 9222;
const headerEnd = Buffer.from("\r\n\r\n");

const server = net.createServer((client) => {
  const upstream = net.connect(targetPort, "127.0.0.1");
  let pending = Buffer.alloc(0);
  let forwarding = false;

  const closePeer = (peer) => () => peer.destroy();
  client.on("error", closePeer(upstream));
  upstream.on("error", closePeer(client));
  upstream.pipe(client);

  client.on("data", (chunk) => {
    if (forwarding) {
      upstream.write(chunk);
      return;
    }

    pending = Buffer.concat([pending, chunk]);
    const endIndex = pending.indexOf(headerEnd);
    if (endIndex < 0) return;

    const request = pending.toString("latin1").replace(
      /\r\nHost:[^\r\n]*/i,
      "\r\nHost: 127.0.0.1:9222",
    );
    upstream.write(Buffer.from(request, "latin1"));
    pending = Buffer.alloc(0);
    forwarding = true;
  });
});

server.listen(listenPort, "0.0.0.0");
