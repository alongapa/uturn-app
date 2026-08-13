// Menú de tres puntos del feed.
//
// Lo que importa acá es qué opciones ve cada persona. El permiso real vive en
// la RLS, pero si el menú ofrece "Eliminar" a cualquiera, el servidor va a
// rechazar la acción y el usuario va a leer un error sin entender por qué.
//
// Nota de API: desde @testing-library/react-native 14, `render` y `fireEvent`
// devuelven promesas (envuelven el `act` asíncrono de React 19). Sin el await
// las queries corren antes de que el árbol exista.

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { PostMenu, type PostMenuAction } from '@/components/feed/post-menu';

async function renderMenu(overrides: Partial<React.ComponentProps<typeof PostMenu>> = {}) {
  const onAction = jest.fn<void, [PostMenuAction]>();
  await render(
    <PostMenu
      canEdit={false}
      canDelete={false}
      publisherName="FEUDD"
      isOwnContent={false}
      onAction={onAction}
      {...overrides}
    />
  );
  return { onAction };
}

/** Abre la hoja: todas las opciones viven dentro del Modal. */
async function openMenu() {
  await fireEvent.press(screen.getByLabelText('Más opciones'));
}

describe('opciones según permisos', () => {
  it('ofrece editar y eliminar en una publicación propia', async () => {
    await renderMenu({ canEdit: true, canDelete: true, isOwnContent: true });
    await openMenu();

    expect(screen.getByText('Editar publicación')).toBeOnTheScreen();
    expect(screen.getByText('Eliminar')).toBeOnTheScreen();
  });

  it('no ofrece reportar ni silenciar contenido propio', async () => {
    // Reportarse a uno mismo no tiene sentido y ensucia la cola de moderación.
    await renderMenu({ canEdit: true, canDelete: true, isOwnContent: true });
    await openMenu();

    expect(screen.queryByText('Reportar')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Silenciar a/)).not.toBeOnTheScreen();
  });

  it('ofrece reportar y silenciar contenido ajeno', async () => {
    await renderMenu({ isOwnContent: false });
    await openMenu();

    expect(screen.getByText('Reportar')).toBeOnTheScreen();
    expect(screen.getByText('Silenciar a FEUDD')).toBeOnTheScreen();
  });

  it('no ofrece editar contenido ajeno aunque se pueda eliminar', async () => {
    // Es el caso del admin: modera (elimina) pero no reescribe lo que otro
    // publicó. Coincide con la política posts_update_own.
    await renderMenu({ canEdit: false, canDelete: true, isOwnContent: false });
    await openMenu();

    expect(screen.queryByText('Editar publicación')).not.toBeOnTheScreen();
    expect(screen.getByText('Eliminar')).toBeOnTheScreen();
  });

  it('invierte la etiqueta de silenciar si ya está silenciado', async () => {
    await renderMenu({ isOwnContent: false, muted: true });
    await openMenu();

    expect(screen.getByText('Dejar de silenciar a FEUDD')).toBeOnTheScreen();
  });

  it('no se dibuja si no queda ninguna opción', async () => {
    // Publicación propia sin permiso de editar ni borrar: un botón que abre una
    // hoja vacía es peor que no tener botón.
    await renderMenu({ canEdit: false, canDelete: false, isOwnContent: true });

    expect(screen.queryByLabelText('Más opciones')).not.toBeOnTheScreen();
  });
});

describe('interacción', () => {
  it('avisa la acción elegida y cierra la hoja', async () => {
    const { onAction } = await renderMenu({ canDelete: true, isOwnContent: true });
    await openMenu();

    await fireEvent.press(screen.getByText('Eliminar'));

    expect(onAction).toHaveBeenCalledWith('delete');
    // La hoja se cierra sola: si quedara abierta taparía el diálogo de
    // confirmación que abre la pantalla justo después.
    expect(screen.queryByText('Eliminar')).not.toBeOnTheScreen();
  });

  it('cierra sin avisar nada al cancelar', async () => {
    const { onAction } = await renderMenu({ canDelete: true, isOwnContent: true });
    await openMenu();

    await fireEvent.press(screen.getByText('Cancelar'));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Eliminar')).not.toBeOnTheScreen();
  });

  it('distingue reportar de silenciar', async () => {
    const { onAction } = await renderMenu({ isOwnContent: false });
    await openMenu();

    await fireEvent.press(screen.getByText('Silenciar a FEUDD'));

    expect(onAction).toHaveBeenCalledWith('mute');
    expect(onAction).not.toHaveBeenCalledWith('report');
  });

  it('expone el disparador como botón accesible', async () => {
    // Es un ícono sin texto: sin label, un lector de pantalla anuncia "botón".
    await renderMenu({ canDelete: true, isOwnContent: true });

    expect(screen.getByLabelText('Más opciones')).toBeOnTheScreen();
  });
});
