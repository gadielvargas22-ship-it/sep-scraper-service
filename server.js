import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

const SEP_HOME = "https://profesiones.sep.gob.mx/";
const SEP_CEDULA = "https://cedulaprofesional.sep.gob.mx/";
const SEP_API =
    "https://cedulaprofesional.sep.gob.mx/api/rnp/solr/profesionista/consultar/byDetalle";

app.use(cors());
app.use(express.json());

let browser = null;

/* =========================================================
   INICIAR CHROMIUM
========================================================= */

async function iniciarBrowser() {
    if (browser && browser.isConnected()) {
        return browser;
    }

    console.log("🚀 Iniciando Chromium...");

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--no-zygote"
        ]
    });

    console.log("🟢 Chromium iniciado correctamente");

    return browser;
}

/* =========================================================
   CREAR CONTEXTO
========================================================= */

async function crearContexto() {
    const b = await iniciarBrowser();

    const context = await b.newContext({
        viewport: {
            width: 1366,
            height: 768
        },

        locale: "es-MX",

        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/151.0.0.0 Safari/537.36",

        ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(45000);

    /* =====================================================
       LOG REQUEST FAILED
    ===================================================== */

    page.on("requestfailed", request => {
        const url = request.url();

        if (url.includes("sep.gob.mx")) {
            console.log(
                "💥 REQUEST FAILED:",
                request.method(),
                url,
                request.failure()?.errorText || ""
            );
        }
    });

    /* =====================================================
       LOG RESPUESTAS IMPORTANTES
    ===================================================== */

    page.on("response", response => {
        const url = response.url();

        if (
            url.includes("sep.gob.mx") &&
            (
                url.includes("/api/") ||
                url.includes("cedulaprofesional")
            )
        ) {
            console.log(
                "⬅️ RESPONSE:",
                response.status(),
                response.request().method(),
                url
            );
        }
    });

    /* =====================================================
       ERRORES JS
    ===================================================== */

    page.on("pageerror", error => {
        console.log(
            "⚠️ PAGE ERROR:",
            error.message
        );
    });

    return {
        context,
        page
    };
}

/* =========================================================
   ABRIR PORTAL PRINCIPAL
========================================================= */

async function abrirPortalPrincipal(page) {
    console.log("======================================");
    console.log("🌐 PASO 1: PORTAL PRINCIPAL SEP");
    console.log("======================================");

    try {
        const response = await page.goto(
            SEP_HOME,
            {
                waitUntil: "domcontentloaded",
                timeout: 30000
            }
        );

        console.log(
            "📡 STATUS:",
            response?.status()
        );

        console.log(
            "🌐 URL:",
            page.url()
        );

        console.log(
            "📄 TITLE:",
            await page.title()
        );

        return true;

    } catch (error) {

        console.log(
            "❌ ERROR PORTAL:",
            error.message
        );

        return false;
    }
}

/* =========================================================
   BUSCAR ENLACE DE CONSULTA
========================================================= */

async function obtenerEnlaceConsulta(page) {
    console.log("======================================");
    console.log("🔗 BUSCANDO CONSULTA PÚBLICA");
    console.log("======================================");

    const enlaces = await page.locator("a").evaluateAll(
        elements =>
            elements.map(a => ({
                texto:
                    (a.innerText || "").trim(),

                href:
                    a.href || ""
            }))
    );

    console.log(
        "🔎 ENLACES ENCONTRADOS:",
        enlaces.length
    );

    const encontrado = enlaces.find(
        enlace =>
            enlace.href.includes(
                "cedulaprofesional.sep.gob.mx"
            ) ||
            enlace.texto
                .toLowerCase()
                .includes("consulta pública") ||
            enlace.texto
                .toLowerCase()
                .includes("cédula")
    );

    if (encontrado) {

        console.log(
            "🟢 ENLACE ENCONTRADO:",
            encontrado
        );

        return encontrado.href;
    }

    console.log(
        "⚠️ NO SE ENCONTRÓ ENLACE."
    );

    return SEP_CEDULA;
}

/* =========================================================
   ABRIR CONSULTA PÚBLICA
========================================================= */

async function abrirConsultaPublica(page) {
    console.log("======================================");
    console.log("🌐 PASO 2: CONSULTA PÚBLICA");
    console.log("======================================");

    let href =
        await obtenerEnlaceConsulta(page);

    if (!href) {
        href = SEP_CEDULA;
    }

    console.log(
        "🎯 DESTINO:",
        href
    );

    try {

        const response =
            await page.goto(
                href,
                {
                    waitUntil: "domcontentloaded",
                    timeout: 45000
                }
            );

        console.log(
            "📡 STATUS CONSULTA:",
            response?.status()
        );

    } catch (error) {

        console.log(
            "⚠️ GOTO CONSULTA:",
            error.message
        );
    }

    await page.waitForTimeout(5000);

    console.log(
        "🌐 URL ACTUAL:",
        page.url()
    );

    console.log(
        "📄 TITLE:",
        await page.title().catch(
            () => ""
        )
    );

    const body =
        await page.locator("body")
            .innerText()
            .catch(() => "");

    console.log(
        "📄 BODY:",
        body.substring(0, 2000)
    );

    return true;
}

/* =========================================================
   BUSCAR CAMPO DE CÉDULA
========================================================= */

async function buscarCampoCedula(page) {

    console.log(
        "🔎 BUSCANDO CAMPO DE CÉDULA..."
    );

    const selectores = [

        'input[name*="cedula" i]',

        'input[id*="cedula" i]',

        'input[placeholder*="cedula" i]',

        'input[placeholder*="cédula" i]',

        'input[aria-label*="cedula" i]',

        'input[aria-label*="cédula" i]',

        'input[type="text"]',

        'input[type="number"]'
    ];

    for (const selector of selectores) {

        const elementos =
            page.locator(selector);

        const total =
            await elementos.count();

        for (
            let i = 0;
            i < total;
            i++
        ) {

            try {

                const elemento =
                    elementos.nth(i);

                if (
                    await elemento.isVisible()
                ) {

                    console.log(
                        "🟢 CAMPO ENCONTRADO:",
                        selector
                    );

                    return elemento;
                }

            } catch {}
        }
    }

    /* =====================================================
       MOSTRAR TODOS LOS INPUTS
    ===================================================== */

    const inputs =
        await page.locator("input")
            .evaluateAll(elements =>
                elements.map(
                    (input, index) => ({
                        index,

                        id:
                            input.id || "",

                        name:
                            input.name || "",

                        type:
                            input.type || "",

                        placeholder:
                            input.placeholder || "",

                        aria:
                            input.getAttribute(
                                "aria-label"
                            ) || "",

                        visible:
                            !!(
                                input.offsetWidth ||
                                input.offsetHeight ||
                                input.getClientRects()
                                    .length
                            )
                    })
                )
            );

    console.log(
        "📋 INPUTS:",
        JSON.stringify(
            inputs,
            null,
            2
        )
    );

    const candidato =
        inputs.find(
            input =>
                input.visible &&
                (
                    input.id
                        .toLowerCase()
                        .includes("cedula") ||

                    input.name
                        .toLowerCase()
                        .includes("cedula") ||

                    input.placeholder
                        .toLowerCase()
                        .includes("cedula") ||

                    input.placeholder
                        .toLowerCase()
                        .includes("cédula")
                )
        );

    if (candidato) {

        return page
            .locator("input")
            .nth(candidato.index);
    }

    return null;
}

/* =========================================================
   BUSCAR BOTÓN
========================================================= */

async function buscarBotonConsulta(page) {

    console.log(
        "🔎 BUSCANDO BOTÓN DE CONSULTA..."
    );

    const elementos =
        page.locator(
            "button, input[type='button'], input[type='submit'], a"
        );

    const total =
        await elementos.count();

    for (
        let i = 0;
        i < total;
        i++
    ) {

        try {

            const elemento =
                elementos.nth(i);

            if (
                !await elemento.isVisible()
            ) {
                continue;
            }

            const texto =
                (
                    await elemento
                        .innerText()
                        .catch(() => "")
                )
                    .trim()
                    .toLowerCase();

            const value =
                (
                    await elemento
                        .getAttribute("value")
                        .catch(() => "")
                )
                    ?.trim()
                    .toLowerCase() || "";

            const aria =
                (
                    await elemento
                        .getAttribute("aria-label")
                        .catch(() => "")
                )
                    ?.trim()
                    .toLowerCase() || "";

            const title =
                (
                    await elemento
                        .getAttribute("title")
                        .catch(() => "")
                )
                    ?.trim()
                    .toLowerCase() || "";

            const contenido =
                `${texto} ${value} ${aria} ${title}`;

            if (
                contenido.includes("buscar") ||
                contenido.includes("consultar") ||
                contenido.includes("consulta")
            ) {

                console.log(
                    "🟢 BOTÓN ENCONTRADO:",
                    texto ||
                    value ||
                    aria ||
                    title
                );

                return elemento;
            }

        } catch {}
    }

    return null;
}

/* =========================================================
   ESPERAR RESPUESTA DE LA API SEP
========================================================= */

async function esperarRespuestaAPI(
    page,
    cedula,
    accionConsulta
) {

    console.log(
        "⏳ ESPERANDO RESPUESTA DE API SEP..."
    );

    try {

        const response =
            await Promise.race([

                page.waitForResponse(
                    async response => {

                        const url =
                            response.url();

                        const method =
                            response.request()
                                .method();

                        if (
                            method !== "POST"
                        ) {
                            return false;
                        }

                        if (
                            !url.includes(
                                "/api/rnp/solr/profesionista/consultar/byDetalle"
                            )
                        ) {
                            return false;
                        }

                        console.log(
                            "🎯 API DETECTADA:",
                            url
                        );

                        return true;
                    },
                    {
                        timeout: 30000
                    }
                ),

                (async () => {

                    await accionConsulta();

                    return null;

                })()

            ]);

        if (!response) {

            console.log(
                "⚠️ No se capturó la API directamente."
            );

            return null;
        }

        console.log(
            "📡 STATUS API:",
            response.status()
        );

        let json = null;

        try {

            json =
                await response.json();

        } catch (error) {

            console.log(
                "⚠️ La respuesta no fue JSON:",
                error.message
            );

            const texto =
                await response.text()
                    .catch(() => "");

            console.log(
                "📄 RESPUESTA:",
                texto.substring(0, 3000)
            );

            return null;
        }

        console.log(
            "🟢 JSON RECIBIDO:"
        );

        console.log(
            JSON.stringify(
                json,
                null,
                2
            )
        );

        return json;

    } catch (error) {

        console.log(
            "❌ ERROR ESPERANDO API:",
            error.message
        );

        return null;
    }
}

/* =========================================================
   NORMALIZAR RESPUESTA SEP
========================================================= */

function normalizarResultado(
    respuesta,
    cedula
) {

    console.log(
        "🔧 NORMALIZANDO RESPUESTA..."
    );

    if (
        !respuesta
    ) {

        return {
            success: false,

            valida: false,

            resultados: [],

            datos: [],

            mensaje:
                "La SEP no devolvió información."
        };
    }

    /*
       La API normalmente devuelve un array
       como:

       [
         {
           cedula: "...",
           nombre: "...",
           ...
         }
       ]
    */

    let registros = [];

    if (
        Array.isArray(
            respuesta
        )
    ) {

        registros =
            respuesta;

    } else if (
        Array.isArray(
            respuesta.data
        )
    ) {

        registros =
            respuesta.data;

    } else if (
        Array.isArray(
            respuesta.resultados
        )
    ) {

        registros =
            respuesta.resultados;

    } else if (
        Array.isArray(
            respuesta.content
        )
    ) {

        registros =
            respuesta.content;

    } else {

        registros = [
            respuesta
        ];
    }

    if (
        registros.length === 0
    ) {

        return {

            success: true,

            valida: false,

            resultados: [],

            datos: [],

            mensaje:
                "No se encontraron registros para la cédula consultada.",

            fechaConsulta:
                new Date().toISOString(),

            fuente: "SEP"
        };
    }

    const registro =
        registros[0];

    /*
       Convertimos el objeto original
       a una estructura fácil de usar
       desde Flutter / frontend.
    */

    const resultado = {

        cedula:
            registro.cedula ||
            registro.numCedula ||
            String(cedula),

        tipo:
            registro.tipo || null,

        anioRegistro:
            registro.anioRegistro || null,

        fechaExpedicion:
            registro.fechaExpedicion || null,

        nombre:
            registro.nombre || null,

        primerApellido:
            registro.primerApellido || null,

        segundoApellido:
            registro.segundoApellido || null,

        genero:
            registro.genero || null,

        curp:
            registro.curp || null,

        fechaNacimiento:
            registro.fechaNacimiento || null,

        entidadNacimiento:
            registro.entidadNacimiento || null,

        sostenimiento:
            registro.sostenimiento || null,

        nivelEducativo:
            registro.nivelEducativo || null,

        carrera:
            registro.carrera || null,

        profesion:
            registro.profesion || null,

        institucion:
            registro.institucion || null,

        entidadInstitucion:
            registro.entidadInstitucion || null,

        areaConocimiento:
            registro.areaConocimiento || null,

        subareaConocimiento:
            registro.subareaConocimiento || null,

        libro:
            registro.libro || null,

        numero:
            registro.numero || null,

        foja:
            registro.foja || null,

        fechaTitulacion:
            registro.fechaTitulacion || null
    };

    console.log(
        "🟢 REGISTRO NORMALIZADO:"
    );

    console.log(
        JSON.stringify(
            resultado,
            null,
            2
        )
    );

    return {

        success: true,

        valida: true,

        resultados: [
            resultado
        ],

        datos: [
            resultado
        ],

        registro: resultado,

        fechaConsulta:
            new Date().toISOString(),

        fuente: "SEP"
    };
}

/* =========================================================
   CONSULTAR CÉDULA
========================================================= */

async function consultarCedula(
    cedula
) {

    let context = null;

    try {

        const abierto =
            await crearContexto();

        context =
            abierto.context;

        const page =
            abierto.page;

        /* ================================================
           PASO 1
        ================================================= */

        const portal =
            await abrirPortalPrincipal(
                page
            );

        if (!portal) {

            return {

                success: false,

                valida: false,

                mensaje:
                    "No fue posible abrir el portal de la SEP."
            };
        }

        /* ================================================
           PASO 2
        ================================================= */

        await abrirConsultaPublica(
            page
        );

        /* ================================================
           PASO 3
        ================================================= */

        const campo =
            await buscarCampoCedula(
                page
            );

        if (!campo) {

            return {

                success: false,

                valida: false,

                mensaje:
                    "La Consulta Pública de la SEP no cargó el formulario de búsqueda.",

                url:
                    page.url()
            };
        }

        /* ================================================
           ESCRIBIR CÉDULA
        ================================================= */

        await campo.fill(
            String(cedula)
        );

        console.log(
            "✍️ CÉDULA ESCRITA:",
            cedula
        );

        /* ================================================
           BUSCAR BOTÓN
        ================================================= */

        const boton =
            await buscarBotonConsulta(
                page
            );

        if (!boton) {

            return {

                success: false,

                valida: false,

                mensaje:
                    "No se encontró el botón de consulta de la SEP.",

                url:
                    page.url()
            };
        }

        /* ================================================
           HACER CLICK Y CAPTURAR API
        ================================================= */

        const respuestaAPI =
            await esperarRespuestaAPI(
                page,
                cedula,
                async () => {

                    console.log(
                        "🔎 ENVIANDO CONSULTA..."
                    );

                    await boton.click({
                        force: true
                    });

                    console.log(
                        "🟢 CLICK REALIZADO"
                    );
                }
            );

        /* ================================================
           SI CAPTURAMOS LA API
        ================================================= */

        if (respuestaAPI) {

            return normalizarResultado(
                respuestaAPI,
                cedula
            );
        }

        /* ================================================
           FALLBACK:
           REVISAR BODY
        ================================================= */

        console.log(
            "🔎 REVISANDO PÁGINA COMO FALLBACK..."
        );

        await page.waitForTimeout(
            5000
        );

        const body =
            await page
                .locator("body")
                .innerText()
                .catch(() => "");

        const lower =
            body.toLowerCase();

        if (
            lower.includes(
                "no se encontraron"
            ) ||
            lower.includes(
                "no se encontró"
            ) ||
            lower.includes(
                "no encontrada"
            ) ||
            lower.includes(
                "sin resultados"
            ) ||
            lower.includes(
                "no existen registros"
            )
        ) {

            return {

                success: true,

                valida: false,

                resultados: [],

                datos: [],

                mensaje:
                    "No se encontraron registros para la cédula consultada.",

                fechaConsulta:
                    new Date().toISOString(),

                fuente: "SEP"
            };
        }

        return {

            success: false,

            valida: false,

            resultados: [],

            datos: [],

            mensaje:
                "La SEP no respondió con un resultado reconocible.",

            url:
                page.url(),

            body:
                body.substring(0, 3000)
        };

    } catch (error) {

        console.error(
            "💥 ERROR CONSULTANDO:",
            error
        );

        return {

            success: false,

            valida: false,

            mensaje:
                "No fue posible completar la consulta en la SEP.",

            error:
                error.message
        };

    } finally {

        if (context) {

            await context
                .close()
                .catch(() => {});
        }
    }
}

/* =========================================================
   POST /validar-cedula
========================================================= */

app.post(
    "/validar-cedula",
    async (req, res) => {

        const cedula =
            req.body?.cedula;

        console.log(
            "======================================"
        );

        console.log(
            "📥 SOLICITUD:",
            cedula
        );

        console.log(
            "======================================"
        );

        /* ================================================
           VALIDAR ENTRADA
        ================================================= */

        if (
            cedula === undefined ||
            cedula === null ||
            !/^\d+$/.test(
                String(cedula)
            )
        ) {

            return res.status(400).json({

                success: false,

                valida: false,

                mensaje:
                    "Número de cédula inválido."
            });
        }

        try {

            const resultado =
                await consultarCedula(
                    String(cedula)
                );

            return res.json(
                resultado
            );

        } catch (error) {

            console.error(
                "💥 ERROR FINAL:",
                error
            );

            return res.status(500).json({

                success: false,

                valida: false,

                mensaje:
                    "Error interno del servicio.",

                error:
                    error.message
            });
        }
    }
);

/* =========================================================
   DIAGNÓSTICO
========================================================= */

app.get(
    "/diagnostico",
    async (req, res) => {

        let context = null;

        try {

            const abierto =
                await crearContexto();

            context =
                abierto.context;

            const page =
                abierto.page;

            const inicio =
                Date.now();

            let status =
                null;

            /* ============================================
               PORTAL
            ============================================ */

            try {

                const response =
                    await page.goto(
                        SEP_HOME,
                        {
                            waitUntil:
                                "domcontentloaded",

                            timeout:
                                30000
                        }
                    );

                status =
                    response?.status() ||
                    null;

            } catch (error) {

                return res.json({

                    success: false,

                    portal: {

                        ok: false,

                        error:
                            error.message,

                        ms:
                            Date.now() -
                            inicio
                    }
                });
            }

            /* ============================================
               CONSULTA
            ============================================ */

            const href =
                await obtenerEnlaceConsulta(
                    page
                );

            return res.json({

                success: true,

                portal: {

                    ok:
                        status >= 200 &&
                        status < 400,

                    status,

                    url:
                        page.url(),

                    ms:
                        Date.now() -
                        inicio
                },

                consultaPublica: {

                    encontrada:
                        !!href,

                    url:
                        href || null
                },

                api: {

                    endpoint:
                        SEP_API,

                    metodo:
                        "POST",

                    disponible:
                        true
                }
            });

        } catch (error) {

            return res.status(500).json({

                success: false,

                error:
                    error.message
            });

        } finally {

            if (context) {

                await context
                    .close()
                    .catch(() => {});
            }
        }
    }
);

/* =========================================================
   HOME
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.json({

            status: "ok",

            service:
                "SEP Scraper Service",

            endpoints: [

                "/",

                "/diagnostico",

                "/validar-cedula"
            ]
        });
    }
);

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    async () => {

        console.log(
            "======================================"
        );

        console.log(
            "🚀 SERVIDOR SEP INICIADO"
        );

        console.log(
            "📡 PUERTO:",
            PORT
        );

        console.log(
            "======================================"
        );

        try {

            await iniciarBrowser();

        } catch (error) {

            console.error(
                "❌ ERROR CHROMIUM:",
                error.message
            );
        }
    }
);

/* =========================================================
   CERRAR BROWSER
========================================================= */

async function cerrarBrowser() {

    try {

        if (browser) {

            await browser.close();
        }

    } catch {}

    browser = null;
}

/* =========================================================
   SIGTERM
========================================================= */

process.on(
    "SIGTERM",
    async () => {

        await cerrarBrowser();

        process.exit(0);
    }
);

/* =========================================================
   SIGINT
========================================================= */

process.on(
    "SIGINT",
    async () => {

        await cerrarBrowser();

        process.exit(0);
    }
);