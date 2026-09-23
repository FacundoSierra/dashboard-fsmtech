import type { Metadata } from 'next';
import { Fingerprint, KeyRound } from 'lucide-react';
import { RegistrarDispositivo } from '@/components/passkeys';
import { Encabezado, FILA, TABLA, TD, TH, Tarjeta, Vacio } from '@/components/ui';
import { fechaCorta, hoyMadrid } from '@/lib/fechas';
import { leerPasskeys } from '@/lib/passkeys/config';
import { verificarSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function PaginaAjustes() {
  await verificarSesion();
  const passkeys = leerPasskeys();
  const hoy = hoyMadrid();

  return (
    <>
      <Encabezado titulo="Ajustes" subtitulo="Cómo se entra al panel" />

      <Tarjeta titulo="Entrar con huella o cara" icono={Fingerprint} sinRelleno>
        {passkeys.length ? (
          <div className="overflow-x-auto">
            <table className={TABLA}>
              <thead>
                <tr>
                  <th className={TH}>Dispositivo</th>
                  <th className={TH}>Registrado</th>
                </tr>
              </thead>
              <tbody>
                {passkeys.map((passkey) => (
                  <tr key={passkey.id} className={FILA}>
                    <td className={`${TD} font-medium`}>{passkey.nombre}</td>
                    <td className={`${TD} text-tenue`}>
                      {fechaCorta(passkey.creado)}
                      {passkey.creado === hoy && ' · hoy'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <Vacio icono={Fingerprint}>
              Todavía no hay ningún dispositivo. Registra este y podrás entrar con Touch ID, Windows Hello o Face ID.
            </Vacio>
          </div>
        )}

        <div className="border-t border-borde p-4">
          <RegistrarDispositivo />
        </div>
      </Tarjeta>

      <Tarjeta className="mt-4" titulo="Cómo funciona" icono={KeyRound}>
        <ul className="space-y-2 text-sm text-tenue">
          <li>
            La huella no sale del dispositivo: se queda en él una llave privada, y el panel solo guarda la parte pública, que no
            sirve para entrar por sí sola.
          </li>
          <li>
            La lista de dispositivos vive en la variable <code>PASSKEYS</code> de Vercel, porque el panel no tiene base de datos.
            Al registrar uno, aquí sale el valor para pegar allí.
          </li>
          <li>
            La contraseña sigue funcionando como respaldo, por si pierdes el dispositivo. Para quitar uno, bórralo de esa
            variable y vuelve a desplegar.
          </li>
          <li>Con una passkey del Mac o del iPhone basta una vez: iCloud la comparte entre tus dispositivos de Apple.</li>
        </ul>
      </Tarjeta>
    </>
  );
}
