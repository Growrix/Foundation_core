export default function SignInPage() {
  return (
    <div className="foundation-shell flex flex-1 items-center justify-center px-6 py-12">
      <section className="foundation-panel w-full max-w-xl p-8">
        <p className="foundation-kicker">Auth fallback</p>
        <h1 className="mt-4 text-3xl font-semibold">Sign in route is ready for adapter wiring.</h1>
        <p className="mt-4 text-sm leading-7 text-(--muted)">
          Public templates can trigger modal auth, but this standalone page remains available as a
          contract-safe fallback until the chosen auth adapter is configured through environment variables.
        </p>
      </section>
    </div>
  );
}