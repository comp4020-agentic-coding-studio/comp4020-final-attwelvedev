import { useEffect, useState } from "preact/hooks";
import { type ConnectionState, type GameSocket, openSocket } from "../client/socket.ts";

// One socket for the life of a page, and what it knows about the connection.
// `socket` is null until the page has hydrated (there is no socket on the server).
export function useSocket(): {
  socket: GameSocket | null;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
} {
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [conn, setConn] = useState<{ state: ConnectionState; rttMs: number | null }>({
    state: "connecting",
    rttMs: null,
  });
  useEffect(() => {
    const opened = openSocket();
    const off = opened.onState((state, rttMs) => setConn({ state, rttMs }));
    setSocket(opened);
    return () => {
      off();
      opened.close();
    };
  }, []);
  return { socket, ...conn, online: conn.state === "live" || conn.state === "weak" };
}
