"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="landing">
      <div className="hero">
        <h1>Vaya, algo ha fallado</h1>
        <p>Puede ser un problema momentáneo de conexión. Prueba otra vez en unos segundos.</p>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
