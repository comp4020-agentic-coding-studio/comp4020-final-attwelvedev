import { receiversOf, verbFor } from "../client/wheel.ts";
import type { Method, Seat } from "../game/types.ts";
import type { CrewMember } from "../net/protocol.ts";
import { RoleShape } from "./RoleShape.tsx";

// Who hears a method, by name: "● Ana hears this · ■ Bo can't". The shapes are
// drawn (RoleShape), never typed, and each name is spelled out beside its shape
// so the line never relies on a shape or a colour alone.
export function ReceiverLine({
  method,
  crew,
  me,
}: {
  method: Method;
  crew: CrewMember[];
  me: Seat;
}) {
  const { hear, cant } = receiversOf(method, crew, me);
  // each receiver's own verb: Can't hear sees a face, Can't speak reads a callout
  const parts = [
    ...hear.map((c) => ({ c, text: verbFor(method) })),
    ...cant.map((c) => ({ c, text: "can't" })),
  ];
  return (
    <span class="receiver-line">
      {parts.map(({ c, text }, i) => (
        <span key={c.seat} class={text === "can't" ? "receiver cant" : "receiver"}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <RoleShape role={c.role} size={14} />
          <span> {c.nickname} </span>
          <span>{text}</span>
        </span>
      ))}
    </span>
  );
}
