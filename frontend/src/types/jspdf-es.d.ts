// La app importa directamente la versión de navegador de jsPDF (la de por defecto es la de servidor y no compila en la web)
declare module 'jspdf/dist/jspdf.es.min.js' {
  export * from 'jspdf';
}
