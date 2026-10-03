# Evaluación del clasificador arancelario

Mide `/api/ai/clasificar` con 60 productos típicos de importación desde China y EE. UU.: grúas, autoelevadores, maquinaria vial, energía solar, LED, electrónica, herramientas, repuestos, electrodomésticos, muebles, textiles, calzado, bolsos y juguetes. Sirve para comparar el clasificador antes y después de un cambio.

- `eval-casos.json`: cada caso tiene la descripción como la escribiría un vendedor, los `atributos` (los datos reales del producto), `ncm_esperado`, `alternativas_aceptables`, `confusion` (los códigos tentadores pero incorrectos) y `confianza` (`alta` o `media`). Los casos dudosos no se incluyen.
- `run-eval.mjs`: corre los casos contra la API. Cuando la IA hace preguntas, las contesta con los `atributos`. Si el texto de una opción aparece tal cual en los atributos, elige esa opción; si no, responde en texto libre.

## 1. Validar los casos (sin API)

```bash
node scripts/eval-clasificador/run-eval.mjs --dry
```

Verifica que cada código esperado, alternativo y de confusión exista y esté vigente en `data/nomenclador.json`. Si cambiás el nomenclador o agregás casos, correlo primero.

## 2. Correr contra un preview de Vercel

1. Abrí el preview (`https://<proyecto>-git-<rama>.vercel.app`) e iniciá sesión con un usuario que tenga acceso al cotizador.
2. En DevTools, en Application > Cookies, copiá el valor de `__Secure-authjs.session-token`.
3. Si el preview tiene Vercel Authentication, usá el secreto de *Protection Bypass for Automation* (Settings > Deployment Protection).
4. Corré:

```bash
BASE_URL=https://<preview>.vercel.app \
SESSION_COOKIE='__Secure-authjs.session-token=<valor>' \
VERCEL_BYPASS=<secreto-opcional> \
node scripts/eval-clasificador/run-eval.mjs --out=eval-resultado.json
```

El preview necesita `GEMINI_API_KEY` y el resto de las variables del entorno Preview.

Opciones:

- `--solo=id1,id2`: corre solo esos casos.
- `--sin-preguntas`: manda `saltarPreguntas: true`.
- `CONCURRENCY=2`: cantidad de casos en paralelo. Subilo con cuidado por el límite de Gemini.
- `TIMEOUT_MS=90000`: tiempo máximo por pedido.

## Qué informa

- **Top-1 / Top-3**: si el primer candidato, o alguno de los tres, es el esperado o una alternativa aceptable.
- **Top-1 en la confusión**: cuántas veces el primer candidato fue justo el código tentador.
- **Hicieron preguntas**: casos en que la API devolvió `etapa: 'preguntas'`.
- **Errores** y **latencia promedio** (con p90), sumando la ronda de preguntas.
- Una tabla con los casos fuera del top-1 y las preguntas que se contestaron en texto libre.

Gemini no es determinista: para comparar dos versiones, corré cada una dos o tres veces y mirá el promedio.
