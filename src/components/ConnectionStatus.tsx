// Plain props, nothing of the pantry, so the offers feed can reuse it. The
// element is always present so a screen reader announces the text when it
// appears.
export function ConnectionStatus({ reconnecting }: { reconnecting: boolean }) {
  return (
    <p class="connection" role="status">
      {reconnecting ? (
        <>
          <strong>Reconnecting…</strong>{" "}
          <span>Others' changes may be a few seconds behind. Your taps still save.</span>
        </>
      ) : null}
    </p>
  );
}
