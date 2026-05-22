export default function ApiDemoBanner() {
  return (
    <div className="api-demo-banner" role="status">
      <strong>Modo demo / datos simulados</strong>
      <span>
        No hay conexión con el servidor. Los indicadores y listados usan datos de demostración hasta que el backend esté activo.
      </span>
    </div>
  );
}
