export default function NotFound() {
  return (
    <div className="foundation-shell flex flex-1 items-center justify-center px-6 py-12">
      <section className="foundation-panel w-full max-w-xl p-8 text-center">
        <p className="foundation-kicker">404</p>
        <h1 className="mt-4 text-3xl font-semibold">Route not found</h1>
        <p className="mt-4 text-sm leading-7 text-(--muted)">
          The requested surface does not exist in this runtime. Use the API routes and attach contract for public template wiring.
        </p>
      </section>
    </div>
  );
}