export default function SignUpPage() {
  return (
    <div className="foundation-shell flex flex-1 items-center justify-center px-6 py-12">
      <section className="foundation-panel w-full max-w-xl p-8">
        <p className="foundation-kicker">Auth fallback</p>
        <h1 className="mt-4 text-3xl font-semibold">Sign up route is ready for adapter wiring.</h1>
        <p className="mt-4 text-sm leading-7 text-(--muted)">
          Keep this route available even when templates use modal-first auth so exported projects retain a direct,
          documented entry point for identity workflows.
        </p>
      </section>
    </div>
  );
}