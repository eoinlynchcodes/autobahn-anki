import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4">Autobahn Anki</h1>
        <p className="text-xl text-gray-600 mb-8">
          Learn languages with spaced repetition flashcards, a personal
          notebook, and AI-powered grammar explanations. Pick up where you left
          off on any device.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-white text-gray-700 px-6 py-3 rounded-lg font-medium border border-gray-300 hover:bg-gray-50 transition"
          >
            Sign In
          </Link>
        </div>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg mb-2">Spaced Repetition</h3>
            <p className="text-gray-600 text-sm">
              SM-2 algorithm schedules reviews at optimal intervals so you
              remember more with less effort.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg mb-2">Personal Notebook</h3>
            <p className="text-gray-600 text-sm">
              Save interesting words and phrases with one click. Your notebook
              syncs across all your devices.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg mb-2">AI Grammar Help</h3>
            <p className="text-gray-600 text-sm">
              Ask Claude to explain grammar rules, word choices, and usage
              patterns for any card.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
