import { Chat } from "@/components/chat";

function MaintenanceBanner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-lg rounded-xl border border-yellow-500/30 bg-zinc-900 p-8 text-center shadow-2xl">
        <div className="mb-4 text-5xl">&#9888;&#65039;</div>
        <h1 className="mb-3 text-2xl font-bold text-yellow-400">
          Temporarily Unavailable
        </h1>
        <p className="mb-4 text-zinc-300">
          We are experiencing very high demand and have temporarily paused the
          service to manage infrastructure costs.
        </p>
        <p className="text-sm text-zinc-500">
          Please check back later. We appreciate your patience.
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <MaintenanceBanner />
      <div className="pointer-events-none select-none opacity-30">
        <Chat />
      </div>
    </>
  );
}
