export default function ApiOfflineBanner() {
  return (
    <div className="api-offline-banner">
      <h3>No se pudo conectar con el servidor</h3>
      <p>El dashboard necesita el backend en marcha. En otra máquina, la primera vez puede tardar varios minutos (genera datos y entrena el modelo).</p>
      <ol>
        <li>Abre una terminal en la carpeta <code>backend</code></li>
        <li>
          <code>python -m venv venv</code> → activar venv →{' '}
          <code>pip install -r requirements.txt</code>
        </li>
        <li>
          <code>python start.py</code> y espera el mensaje &quot;Uvicorn running on http://0.0.0.0:8000&quot;
        </li>
        <li>En otra terminal: <code>cd frontend</code> → <code>npm install</code> → <code>npm run dev</code></li>
        <li>Abre <a href="http://localhost:5173">http://localhost:5173</a> y recarga (F5)</li>
      </ol>
      <p className="api-offline-hint">
        También puedes ejecutar <code>.\scripts\setup.ps1</code> (Windows) o <code>./scripts/setup.sh</code> (Mac/Linux) desde la raíz del proyecto.
      </p>
    </div>
  );
}
