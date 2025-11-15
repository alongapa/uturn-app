import * as WebBrowser from 'expo-web-browser';

// Abre el checkout web externo utilizando el navegador del dispositivo
export async function startWebCheckout(url: string) {
  if (!url) {
    console.warn('startWebCheckout llamado sin una URL válida'); // Log de respaldo para depurar llamadas incompletas
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(url); // Lanza el navegador con el enlace de pago
  } catch (error) {
    console.error('Fallo al abrir el navegador para el pago', error); // Reporta errores inesperados durante el flujo
  }
}
