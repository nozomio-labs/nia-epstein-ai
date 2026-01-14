import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-lg text-white/60">Page not found</p>
        <Link href="/" className="mt-6 inline-block text-sm text-white/40 hover:text-white/60 transition-colors">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
