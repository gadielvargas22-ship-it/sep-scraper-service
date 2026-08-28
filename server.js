import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

const SEP_HOME = "https://profesiones.sep.gob.mx/";
const SEP_CEDULA = "https://cedulaprofesional.sep.gob.mx/";

app.use(cors());
app.use(express.json());

let browser = null;

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

async function crearContexto() {
    const b = await iniciarBrowser();

    const context = await b.newContext({
        viewport: {
            width: 1366,
            height: 768
        },
        locale: "es-MX",
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(45000);

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

    page.on("response", response => {
        const url = response.url();

        if (url.includes("sep.gob.mx")) {
            console.log(
                "⬅️ RESPONSE:",
                response.status(),
                response.request().method(),
                url
            );
        }
    });

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

        console.log("📡 STATUS:", response?.status());
        console.log("🌐 URL:", page.url());
        console.log("📄 TITLE:", await page.title());

        return true;
    } catch (error) {
        console.log(
            "❌ ERROR PORTAL:",
            error.message
        );

        return false;
    }
}

async function obtenerEnlaceConsulta(page) {
    console.log("======================================");
    console.log("🔗 BUSCANDO CONSULTA PÚBLICA");
    console.log("======================================");

    const enlaces = await page.locator("a").evaluateAll(
        elements =>
            elements.map(a => ({
                texto: (a.innerText || "").trim(),
                href: a.href || ""
            }))
    );

    const encontrado = enlaces.find(
        enlace =>
            enlace.href.includes(
                "cedulaprofesional.sep.gob.mx"
            ) ||
            enlace.texto
                .toLowerCase()
                .includes("consulta pública")
    );

    if (encontrado) {
        console.log(
            "🟢 ENLACE ENCONTRADO:",
            encontrado
        );

        return encontrado.href;
    }

    console.log(
        "❌ NO SE ENCONTRÓ CONSULTA PÚBLICA"
    );

    return null;
}

async function abrirConsultaPublica(page) {
    console.log("======================================");
    console.log("🌐 PASO 2: CONSULTA PÚBLICA");
    console.log("======================================");

    const href =
        await obtenerEnlaceConsulta(page);

    if (!href) {
        throw new Error(
            "No se encontró el enlace de Consulta Pública"
        );
    }

    console.log("🎯 DESTINO:", href);

    try {
        const response = await page.goto(
            href,
            {
                waitUntil: "commit",
                timeout: 20000
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
        body.substring(0, 3000)
    );

    return {
        url: page.url(),
        title: await page.title().catch(
            () => ""
        ),
        body: body.substring(0, 5000)
    };
}

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

        for (let i = 0; i < total; i++) {
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

    const inputs =
        await page.locator("input")
            .evaluateAll(elements =>
                elements.map(
                    (input, index) => ({
                        index,
                        id: input.id || "",
                        name: input.name || "",
                        type: input.type || "",
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
        return page.locator("input").nth(
            candidato.index
        );
    }

    return null;
}

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

    for (let i = 0; i < total; i++) {
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

            const contenido =
                `${texto} ${value} ${aria}`;

            if (
                contenido.includes("buscar") ||
                contenido.includes("consultar") ||
                contenido.includes("consulta")
            ) {
                console.log(
                    "🟢 BOTÓN ENCONTRADO:",
                    texto || value || aria
                );

                return elemento;
            }
        } catch {}
    }

    return null;
}

async function extraerTodosLosDatos(page) {
    console.log("======================================");
    console.log("📊 EXTRAYENDO RESULTADO");
    console.log("======================================");

    const limite =
        Date.now() + 25000;

    while (Date.now() < limite) {
        try {
            const filas =
                page.locator("tbody tr");

            const total =
                await filas.count();

            if (total > 0) {
                const resultados = [];

                for (
                    let i = 0;
                    i < total;
                    i++
                ) {
                    const fila =
                        filas.nth(i);

                    const celdas =
                        await fila
                            .locator("td")
                            .allTextContents();

                    const datos =
                        celdas.map(
                            texto =>
                                texto
                                    .trim()
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                        );

                    if (
                        datos.some(
                            x => x.length > 0
                        )
                    ) {
                        resultados.push(
                            datos
                        );
                    }
                }

                if (
                    resultados.length > 0
                ) {
                    console.log(
                        "🟢 RESULTADOS:",
                        resultados.length
                    );

                    console.log(
                        JSON.stringify(
                            resultados,
                            null,
                            2
                        )
                    );

                    return {
                        success: true,
                        valida: true,
                        resultados,
                        datos: resultados,
                        fechaConsulta:
                            new Date().toISOString(),
                        fuente: "SEP"
                    };
                }
            }
        } catch {}

        const texto =
            await page.locator("body")
                .innerText()
                .catch(() => "");

        const lower =
            texto.toLowerCase();

        if (
            lower.includes("no se encontraron") ||
            lower.includes("no se encontró") ||
            lower.includes("no encontrada") ||
            lower.includes("sin resultados") ||
            lower.includes("no existen registros")
        ) {
            console.log(
                "⚠️ SIN RESULTADOS"
            );

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

        await page.waitForTimeout(1000);
    }

    return {
        success: false,
        valida: false,
        resultados: [],
        datos: [],
        mensaje:
            "La SEP no respondió con un resultado dentro del tiempo esperado.",
        fechaConsulta:
            new Date().toISOString(),
        fuente: "SEP"
    };
}

async function consultarCedula(cedula) {
    let context = null;

    try {
        const abierto =
            await crearContexto();

        context =
            abierto.context;

        const page =
            abierto.page;

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

        await abrirConsultaPublica(
            page
        );

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
                url: page.url()
            };
        }

        await campo.fill(
            String(cedula)
        );

        console.log(
            "✍️ CÉDULA ESCRITA:",
            cedula
        );

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
                url: page.url()
            };
        }

        await boton.click({
            force: true
        });

        console.log(
            "🔎 CONSULTA ENVIADA"
        );

        return await extraerTodosLosDatos(
            page
        );

    } catch (error) {
        console.error(
            "💥 ERROR CONSULTANDO:",
            error.message
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

            try {
                const response =
                    await page.goto(
                        SEP_HOME,
                        {
                            waitUntil:
                                "domcontentloaded",
                            timeout: 30000
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

async function cerrarBrowser() {
    try {
        if (browser) {
            await browser.close();
        }
    } catch {}

    browser = null;
}

process.on(
    "SIGTERM",
    async () => {
        await cerrarBrowser();
        process.exit(0);
    }
);

process.on(
    "SIGINT",
    async () => {
        await cerrarBrowser();
        process.exit(0);
    }
);