import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacidad" };

export default function PrivacidadPage() {
  return (
    <main className="prose">
      <p>
        <Link href="/">← Volver</Link>
      </p>
      <h1>Política de privacidad</h1>
      <p>
        Lunas es una aplicación para que dos personas compartan el seguimiento de su ciclo menstrual. Los datos de salud
        son especialmente sensibles, así que tratamos los tuyos con el mínimo imprescindible.
      </p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li>De tu cuenta de Google: nombre, correo electrónico y foto de perfil.</li>
        <li>Las fechas de tus reglas y lo que apuntes cada día (flujo, síntomas, ánimo y notas).</li>
        <li>Tus ajustes y, si te conectas, con qué compañera estás conectada.</li>
        <li>Los mensajitos de cariño, que se borran automáticamente a los 30 días.</li>
      </ul>

      <h2>Quién los ve</h2>
      <p>
        Solo tú y la compañera con la que te conectes de forma voluntaria (ella te invita y tú aceptas, o al revés). Tú
        eliges si ella ve tus síntomas, tus notas y tus días fértiles. No vendemos ni cedemos datos a terceros ni
        mostramos publicidad.
      </p>

      <h2>Para qué los usamos</h2>
      <p>Únicamente para mostrarte tu ciclo, calcular predicciones y compartirlo con tu compañera.</p>

      <h2>Dónde se guardan</h2>
      <p>
        En la base de datos de quien despliega esta instancia de Lunas (MongoDB). La sesión se guarda en una cookie
        cifrada en tu navegador.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Desde <strong>Ajustes</strong> puedes descargar todos tus datos en cualquier momento y borrar tu cuenta: se
        eliminan tus reglas, registros, invitaciones y mensajitos de forma inmediata y permanente.
      </p>

      <h2>Aviso importante</h2>
      <p>
        Las predicciones son estimaciones basadas en el método del calendario. No son un método anticonceptivo ni
        sustituyen el consejo de una profesional sanitaria.
      </p>
    </main>
  );
}
