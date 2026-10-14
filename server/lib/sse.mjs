// Server-Sent Events hub. Event names are "<module>:<event>".
const clients = new Set();

export function addClient(res, req) {
  clients.add(res);
  const drop = () => clients.delete(res);
  (req || res).on("close", drop);
  res.on("error", drop);
}

export function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
  for (const c of clients) {
    try {
      c.write(msg);
    } catch {
      clients.delete(c);
    }
  }
}

export const clientCount = () => clients.size;

setInterval(() => {
  for (const c of clients) {
    try {
      c.write(": ping\n\n");
    } catch {
      clients.delete(c);
    }
  }
}, 20_000).unref();
