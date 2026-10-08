import { IconSparkles } from "../../components/icons";

export default function AppLoading() {
  return (
    <main className="app-loading" aria-live="polite">
      <div className="app-loading__mark"><IconSparkles width={21} height={21} /></div>
      <p>Preparing your workspace…</p>
    </main>
  );
}
