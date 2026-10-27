import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminEmail } from "@/lib/supabase/admin";
import { ACTIVITY_EVENTS, activityLabel } from "@/lib/activity";

interface UserStats {
  user_id: string;
  email: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  active_days_30d: number;
  events_7d: number;
  reviews_7d: number;
  reviews_total: number;
  decks: number;
  cards: number;
  notebook_entries: number;
  top_features: string[];
}

interface DailyActivity {
  day: string;
  active_users: number;
  reviews: number;
  events: number;
}

interface FeatureUsage {
  event: string;
  uses: number;
  users: number;
  last_used_at: string;
}

interface PageViews {
  path: string | null;
  views: number;
  users: number;
}

const PERIODS = [7, 30, 90];
const DAY_MS = 24 * 60 * 60 * 1000;

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pretend the page doesn't exist for anyone who isn't an admin
  if (!user || !isAdminEmail(user.email)) {
    notFound();
  }

  const requestedDays = Number((await searchParams).days);
  const days = PERIODS.includes(requestedDays) ? requestedDays : 30;

  const admin = createAdminClient();
  if (!admin) {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        <div className="bg-amber-50 text-amber-800 p-4 rounded-lg text-sm">
          Set the <code>SUPABASE_SERVICE_ROLE_KEY</code> environment variable to
          see usage data.
        </div>
      </AppShell>
    );
  }

  const [usersRes, dailyRes, featuresRes, pagesRes] = await Promise.all([
    admin.rpc("admin_user_stats"),
    admin.rpc("admin_daily_activity", { days }),
    admin.rpc("admin_feature_usage", { days }),
    admin.rpc("admin_page_views", { days }),
  ]);

  const error =
    usersRes.error || dailyRes.error || featuresRes.error || pagesRes.error;
  if (error) {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm space-y-2">
          <p>Couldn&apos;t load usage data: {error.message}</p>
          <p>
            Make sure you&apos;ve run the &ldquo;Usage tracking + admin&rdquo;
            section of <code>src/lib/supabase/schema.sql</code> in the Supabase
            SQL Editor.
          </p>
        </div>
      </AppShell>
    );
  }

  const users = (usersRes.data ?? []) as UserStats[];
  const daily = (dailyRes.data ?? []) as DailyActivity[];
  const features = ((featuresRes.data ?? []) as FeatureUsage[]).filter(
    (f) => f.event !== "page_view"
  );
  const pages = (pagesRes.data ?? []) as PageViews[];

  // Server component renders once per request, so reading the clock here is fine
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const activeWithin = (ms: number) =>
    users.filter(
      (u) => u.last_active_at && now - new Date(u.last_active_at).getTime() < ms
    ).length;
  const activeInPeriod = activeWithin(days * DAY_MS);
  const reviewsInPeriod = daily.reduce((sum, d) => sum + Number(d.reviews), 0);
  const newInPeriod = users.filter(
    (u) => now - new Date(u.signed_up_at).getTime() < days * DAY_MS
  ).length;

  const usedEvents = new Set(features.map((f) => f.event));
  const unusedFeatures = Object.keys(ACTIVITY_EVENTS).filter(
    (e) => e !== "page_view" && !usedEvents.has(e)
  );
  const peakDailyUsers = Math.max(0, ...daily.map((d) => Number(d.active_users)));
  const maxDailyUsers = Math.max(1, peakDailyUsers);
  const maxPageViews = Math.max(1, ...pages.map((p) => Number(p.views)));

  const stats = [
    { label: "Total users", value: users.length },
    { label: "Active today", value: activeWithin(DAY_MS) },
    { label: "Active this week", value: activeWithin(7 * DAY_MS) },
    { label: `Active in ${days} days`, value: activeInPeriod },
    { label: `New in ${days} days`, value: newInPeriod },
    { label: `Reviews in ${days} days`, value: reviewsInPeriod },
  ];

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Usage</h1>
          <p className="text-sm text-gray-500">
            Who&apos;s using Autobahn Anki, when, and which features they reach
            for. Days are in UTC.
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/admin?days=${p}`}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                p === days
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {p} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white border border-gray-200 rounded-xl p-4"
          >
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
        <h2 className="font-semibold">Active people per day</h2>
        <p className="text-sm text-gray-500 mb-4">
          Hover a day for its reviews and total actions.
        </p>
        <div className="flex items-end gap-0.5 h-32">
          {daily.map((d) => (
            <div
              key={d.day}
              className="flex-1 h-full flex flex-col justify-end group"
              title={`${formatDate(d.day)}: ${d.active_users} active, ${d.reviews} reviews, ${d.events} actions`}
            >
              <div
                className="bg-blue-500 group-hover:bg-blue-700 rounded-t-sm min-h-px transition"
                style={{
                  height: `${(Number(d.active_users) / maxDailyUsers) * 100}%`,
                }}
              />
            </div>
          ))}
        </div>
        {daily.length > 0 && (
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>{formatDate(daily[0].day)}</span>
            <span>
              Peak: {peakDailyUsers}{" "}
              {peakDailyUsers === 1 ? "person" : "people"}
            </span>
            <span>{formatDate(daily[daily.length - 1].day)}</span>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2 mb-8">
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold">Features people use</h2>
          <p className="text-sm text-gray-500 mb-4">
            Share of the {activeInPeriod} active{" "}
            {activeInPeriod === 1 ? "person" : "people"} who used each feature
            in the last {days} days.
          </p>
          {features.length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {features.map((f) => {
                const share = activeInPeriod
                  ? Math.round((Number(f.users) / activeInPeriod) * 100)
                  : 0;
                return (
                  <li key={f.event}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{activityLabel(f.event)}</span>
                      <span
                        className="text-gray-500 tabular-nums"
                        title={`Last used ${formatDateTime(f.last_used_at)}`}
                      >
                        {f.users} {Number(f.users) === 1 ? "person" : "people"} ·{" "}
                        {f.uses}×
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(share, 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {unusedFeatures.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">
                Nobody used these
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {unusedFeatures.map(activityLabel).join(", ")}
              </p>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold">Pages people visit</h2>
          <p className="text-sm text-gray-500 mb-4">
            Visits per page in the last {days} days.
          </p>
          {pages.length === 0 ? (
            <p className="text-sm text-gray-400">No visits yet.</p>
          ) : (
            <ul className="space-y-3">
              {pages.map((p) => (
                <li key={p.path ?? "unknown"}>
                  <div className="flex justify-between text-sm">
                    <code className="text-gray-700">{p.path ?? "unknown"}</code>
                    <span className="text-gray-500 tabular-nums">
                      {p.users} {Number(p.users) === 1 ? "person" : "people"} ·{" "}
                      {p.views} visits
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                    <div
                      className="h-full bg-gray-400 rounded-full"
                      style={{
                        width: `${(Number(p.views) / maxPageViews) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold">People</h2>
        <p className="text-sm text-gray-500 mb-4">
          Most recently active first. Top features are from the last 30 days.
        </p>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Last active</th>
                <th className="py-2 pr-4 font-medium text-right">
                  Days active (30d)
                </th>
                <th className="py-2 pr-4 font-medium text-right">
                  Reviews (7d / all)
                </th>
                <th className="py-2 pr-4 font-medium text-right">
                  Decks / cards
                </th>
                <th className="py-2 pr-4 font-medium text-right">Notebook</th>
                <th className="py-2 font-medium">Top features</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.user_id}
                  className="border-b border-gray-100 last:border-0 align-top"
                >
                  <td className="py-2 pr-4">
                    <div className="font-medium">
                      {u.email ?? "(no email)"}
                      {u.user_id === user.id && (
                        <span className="ml-1 text-xs text-gray-400">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      Joined {formatDate(u.signed_up_at)}
                    </div>
                  </td>
                  <td
                    className="py-2 pr-4 whitespace-nowrap"
                    title={formatDateTime(u.last_active_at)}
                  >
                    {timeAgo(u.last_active_at, now)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {u.active_days_30d}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {u.reviews_7d} / {u.reviews_total}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {u.decks} / {u.cards}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {u.notebook_entries}
                  </td>
                  <td className="py-2 text-gray-600">
                    {u.top_features.length > 0
                      ? u.top_features.map(activityLabel).join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
