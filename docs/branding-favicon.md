# Ícono / favicon de ListaSuper

## Qué se generó

| Archivo | Tamaño | Uso |
|---|---|---|
| `public/favicon.ico` | 16/32/48 (multi-res) | Pestaña del navegador (compatibilidad legacy) |
| `public/icons/favicon-16.png`, `favicon-32.png` | 16×16, 32×32 | Pestaña del navegador (browsers modernos) |
| `public/icons/apple-touch-icon.png` | 180×180 | "Agregar a inicio" en iOS/Safari |
| `public/icons/icon-192.png`, `icon-512.png` | 192×192, 512×512 | Ícono de la PWA en Android/Chrome (`purpose: any`) |
| `public/icons/icon-512-maskable.png` | 512×512 | Ícono adaptable de Android (`purpose: maskable`, con zona de seguridad para que no se recorte al aplicar máscara circular/squircle) |
| `public/icons/icon.svg` | vectorial | Fuente escalable, para regenerar tamaños futuros o usar como `<link rel="icon" type="image/svg+xml">` |
| `public/site.webmanifest` | — | Web App Manifest para que el navegador ofrezca "Agregar a pantalla de inicio" |

## De dónde sale el diseño

Se buscó en la web una librería de íconos de uso libre para no depender de un ícono con licencia ambigua ni de un banco de imágenes. Se eligió **[Lucide Icons](https://lucide.dev/license)** (fork open source de Feather Icons), licencia **ISC** — gratuita para uso comercial y personal, sin necesidad de atribución. Es además la librería de íconos que trae por defecto `shadcn/ui`, que ya elegimos como sistema de componentes (Decisión de Fase 0), así que el favicon queda consistente con los íconos que se van a usar adentro de la app.

Se tomó el glifo `shopping-basket` directamente del repositorio oficial (`lucide-icons/lucide`, archivo `icons/shopping-basket.svg`) y se lo montó sobre un fondo verde (`#16A34A`) con el glifo en blanco, exportado en todos los tamaños que pide cada plataforma (ver tabla). No se usó ninguna imagen de terceros con derechos reservados.

## Por qué "canasta" y no un carrito

Un carrito de supermercado (`shopping-cart`) es el ícono más obvio, pero a tamaños chicos (16-32px, que es como se ve la mayor parte del tiempo en la pestaña del navegador) pierde legibilidad por tener más líneas finas y ruedas pequeñas. La canasta (`shopping-basket`) tiene una silueta más simple y un trazo más grueso, que se mantiene reconocible incluso en 32px — se verificó renderizando y ampliando el favicon de 32px para confirmarlo antes de darlo por bueno.

## Color de marca

Verde `#16A34A` (equivalente a `green-600` de Tailwind): asociación directa con "fresco/almacén", buen contraste con el ícono blanco, y funciona bien tanto en modo claro como oscuro del sistema operativo al ser un color con brillo medio (no depende de si el fondo del OS es claro u oscuro, a diferencia de un ícono transparente).

## Cómo se integra en Next.js (Fase 0)

Next.js App Router reconoce automáticamente estos archivos si se colocan directamente en `app/`:
- `app/favicon.ico`
- `app/icon.png` (o `icon.svg`)
- `app/apple-icon.png`

Alternativa (la que vamos a usar, porque ya están en `public/`): declarar los metadatos manualmente en `app/layout.tsx` vía el objeto `metadata` de Next.js (`icons`, `manifest`), apuntando a `/favicon.ico`, `/icons/icon.svg`, `/icons/apple-touch-icon.png` y `/site.webmanifest`. Así no hay que mover archivos cuando se scaffoldee el proyecto.
