export default function PreviewPage() {
  return (
    <div className="foundation-shell flex flex-1 items-center justify-center px-6 py-12">
      <section className="foundation-panel w-full max-w-3xl p-8">
        <p className="foundation-kicker">Preview shell</p>
        <h1 className="mt-4 text-3xl font-semibold">Draft preview surface</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-(--muted)">
          Connected templates can use this route while draft mode is enabled through the preview API. The route stays
          generic so screenshot-driven client builds do not inherit unnecessary presentation choices.
        </p>
      </section>
    </div>
  );
}