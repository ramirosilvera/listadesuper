export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 text-center dark:bg-black">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#16A34A] text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-9 w-9"
        >
          <path d="m15 11-1 9" />
          <path d="m19 11-4-7" />
          <path d="M2 11h20" />
          <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" />
          <path d="M4.5 15.5h15" />
          <path d="m5 11 4-7" />
          <path d="m9 11 1 9" />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        ListaSuper
      </h1>
      <p className="mt-3 w-full max-w-md text-lg leading-7 text-zinc-600 dark:text-zinc-400">
        La lista de súper que se acuerda de lo que se te vence y de lo que se
        te está por acabar.
      </p>
      <p className="mt-8 w-fit max-w-full rounded-full bg-zinc-200 px-4 py-1.5 text-sm font-medium text-balance text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Fase 0 lista — Fase 1 (lista compartida + stock) en construcción
      </p>
    </div>
  );
}
