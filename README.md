# Malvinas Dia a Dia

Aplicacion interactiva offline para el Museo Malvinas Argentinas de San Carlos de Bariloche.

El proyecto esta pensado para funcionar como una experiencia de pantalla tactil con dos modos conectados entre si:

- `Modo edicion`: permite crear dias, asignar imagenes de fondo, cargar iconos, posicionarlos en el mapa y asociarles contenido.
- `Modo visualizacion`: muestra exactamente la misma informacion, pero sin permitir cambios.

Todo lo que se modifica en `Modo edicion` queda guardado en SQLite y se refleja automaticamente en `Modo visualizacion`.

## Stack

- `Electron`
- `React`
- `TypeScript`
- `SQLite` con `better-sqlite3`
- `Vite`

## Requisitos

Instalar en Windows:

- `Node.js` LTS
- `npm`
- `Git`

Comandos recomendados para verificar:

```powershell
node -v
npm -v
git --version
```

## Instalacion

Desde la carpeta del proyecto:

```powershell
npm install
```

Si `better-sqlite3` necesita recompilarse para Electron:

```powershell
npm run rebuild:electron
```

## Ejecutar en desarrollo

```powershell
npm run dev
```

Si PowerShell bloquea `npm`, usar:

```powershell
npm.cmd run dev
```

## Compilar

```powershell
npm run build
```

## Como funciona hoy

### Menu principal

La aplicacion inicia con un menu que permite elegir:

- `Modo visualizacion`
- `Modo edicion`

### Modo edicion

Permite:

- crear dias
- editar el nombre de un dia
- borrar dias
- elegir una imagen de fondo por dia
- hacer zoom sobre el mapa
- mover el mapa cuando esta ampliado
- cargar una biblioteca de iconos PNG
- arrastrar iconos al mapa
- mover o borrar iconos colocados
- asociar a cada icono contenido de tipo `texto`, `imagen` o `video`

### Modo visualizacion

Permite:

- recorrer los dias ya creados
- ver el fondo correspondiente a cada dia
- hacer zoom sobre el mapa
- mover el mapa cuando esta ampliado
- ver los iconos colocados

No permite:

- crear o borrar dias
- editar nombres
- cargar fondos
- agregar iconos
- mover iconos
- borrar iconos
- editar contenido

## Persistencia de datos

La app crea y usa una carpeta local de datos en:

```text
Documentos/MapaMalvinas_Data/
```

Dentro de esa carpeta se almacenan:

- base de datos SQLite
- imagenes usadas por el proyecto
- videos o recursos asociados

## Estructura general

```text
src/
  main/        -> proceso principal de Electron e IPC
  preload/     -> puente seguro entre Electron y renderer
  renderer/    -> interfaz React
  db/          -> conexion SQLite, migraciones y repositorios
  shared/      -> tipos compartidos
public/
  static/      -> assets visuales estaticos
```

## Notas de uso

- Cuando se cambian archivos de `main` o `preload`, conviene reiniciar Electron completo.
- El proyecto esta pensado para seguir creciendo con nuevas interacciones en el `Modo visualizacion`.
- La base actual prioriza funcionamiento offline y facilidad de mantenimiento.

## Estado

Proyecto en desarrollo activo.
