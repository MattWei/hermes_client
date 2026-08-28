import { BrandMark } from './components/brand-mark'

export function IpadHome() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--ui-bg-primary)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[var(--ui-text-primary)]">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-3xl flex-col">
        <header className="flex items-center gap-3 border-b border-(--ui-stroke-tertiary) pb-5">
          <BrandMark className="size-11 rounded-xl" />
          <div>
            <h1 className="font-['Collapse'] text-2xl font-bold tracking-tight">Hermes</h1>
            <p className="text-sm text-[var(--ui-text-secondary)]">Your remote workspace</p>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12" aria-labelledby="welcome-title">
          <p className="mb-3 font-mono text-xs tracking-[0.18em] text-[var(--ui-text-tertiary)]">MOBILE CLIENT · PREVIEW</p>
          <h2 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl" id="welcome-title">
            Ready when your workspace is.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ui-text-secondary)]">
            This first build keeps the Hermes experience on your mobile device while your agent stays on another computer.
          </p>
          <div className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--ui-bg-quaternary)] px-3 py-2 text-sm text-[var(--ui-text-secondary)]">
            <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
            Backend not connected
          </div>
        </section>

        <form className="border-t border-(--ui-stroke-tertiary) pt-4" onSubmit={event => event.preventDefault()}>
          <label className="sr-only" htmlFor="ipad-message">
            Message composer
          </label>
          <div className="flex items-end gap-3 rounded-2xl bg-[var(--ui-bg-quaternary)] p-3">
            <textarea
              aria-label="Message composer"
              className="min-h-14 flex-1 resize-none bg-transparent px-1 py-2 text-base outline-none placeholder:text-[var(--ui-text-tertiary)]"
              disabled
              id="ipad-message"
              placeholder="Connect a Hermes backend to start a conversation"
              rows={2}
            />
            <button
              aria-label="Send message"
              className="shrink-0 rounded-xl bg-[var(--ui-text-primary)] px-4 py-2 text-sm font-medium text-[var(--ui-bg-primary)] opacity-40"
              disabled
              type="submit"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
