// Contenido de las reglas de pago que se muestran antes de la primera reserva.
//
// Estos tests no verifican estilos: verifican que lo que la pantalla *promete*
// coincida con lo que el servidor hace. Si alguien cambia el plazo o el umbral
// de strikes y la copia queda vieja, la app le habría mentido a un usuario
// sobre una regla que le cuesta plata.

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { PAYMENT_RULES, PaymentRulesList } from '@/components/onboarding/payment-rules';
import { PAYMENT_DEADLINE_HOURS } from '@/services/payments';
import { PAYMENT_STRIKES_FOR_BAN } from '@/services/penalties';

describe('coherencia con las reglas del servidor', () => {
  it('anuncia el mismo plazo que usa el cálculo del vencimiento', async () => {
    await render(<PaymentRulesList />);

    // getAllBy y no getBy: el plazo aparece en el título de la regla y otra vez
    // en su cuerpo, a propósito — es el número que hay que retener.
    expect(screen.getAllByText(new RegExp(`${PAYMENT_DEADLINE_HOURS} horas`)).length).toBeGreaterThan(0);
  });

  it('anuncia el mismo umbral de strikes que aplica el baneo', async () => {
    await render(<PaymentRulesList />);

    expect(
      screen.getByText(new RegExp(`${PAYMENT_STRIKES_FOR_BAN} strikes`))
    ).toBeOnTheScreen();
  });

  it('no deja ningún número escrito a mano en la copia', () => {
    // Si el plazo dejara de venir de la constante, cambiarla en
    // services/payments.ts no movería este texto y nadie se enteraría.
    const deadlineRule = PAYMENT_RULES.find((rule) => rule.title.includes('horas para transferir'));

    expect(deadlineRule?.title).toContain(String(PAYMENT_DEADLINE_HOURS));
  });
});

describe('lo que el usuario tiene que entender sí o sí', () => {
  it('explica que marcar "ya pagué" no lo protege del strike', async () => {
    // Es el cambio de la Sesión 8 y el más contraintuitivo: la fuente de
    // verdad dejó de ser la palabra del pasajero. Si esto no se dice, el
    // primer strike se va a sentir como un error de la app.
    await render(<PaymentRulesList />);

    expect(screen.getByText(/no basta con marcar/i)).toBeOnTheScreen();
    expect(screen.getByText(/verificada/i)).toBeOnTheScreen();
  });

  it('dice explícitamente quién recibe el strike', async () => {
    await render(<PaymentRulesList />);

    expect(screen.getByText(/lo recibe el pasajero que no pagó, nunca el conductor/i)).toBeOnTheScreen();
  });

  it('ofrece la disputa como salida cuando sí se pagó', async () => {
    // Sin esta regla, alguien que pagó y no se verificó cree que no tiene
    // recurso y el strike le queda encima.
    await render(<PaymentRulesList />);

    expect(screen.getByText(/yo sí pagué/i)).toBeOnTheScreen();
    expect(screen.getByText(/congelado/i)).toBeOnTheScreen();
  });

  it('explica la ventana de cancelación gratis con sus dos plazos', async () => {
    // 2 h normal, 12 h para los viajes de la mañana: si solo se dijera "2
    // horas", quien cancela un viaje de las 8 a las 6 AM se llevaría una
    // penalización que la app le dijo que no existía.
    await render(<PaymentRulesList />);

    expect(screen.getByText(/2 horas antes/i)).toBeOnTheScreen();
    expect(screen.getByText(/12 horas/i)).toBeOnTheScreen();
  });

  it('explica que reservar le quita el cupo a alguien más', async () => {
    await render(<PaymentRulesList />);

    expect(screen.getByText(/compromiso/i)).toBeOnTheScreen();
  });
});

describe('accesibilidad', () => {
  it('expone cada regla como un solo nodo legible', async () => {
    // Con el ícono, el título y el cuerpo sueltos, VoiceOver lee tres nodos
    // por regla y la lista se vuelve inescuchable.
    await render(<PaymentRulesList />);

    for (const rule of PAYMENT_RULES) {
      expect(screen.getByLabelText(`${rule.title}. ${rule.body}`)).toBeOnTheScreen();
    }
  });
});
