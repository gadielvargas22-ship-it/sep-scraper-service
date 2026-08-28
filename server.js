import express from "express";
import cors from "cors";
import dns from "node:dns/promises";
import https from "node:https";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

let browser = null;

const SEP_HOME = "https://profesiones.sep.gob.mx/";
const SEP_CEDULA = "https://cedulaprofesional.sep.gob.mx/";

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

async function cerrarBrowser() {
    try {
        if (browser) {
            await browser.close();
        }
    } catch {}

    browser = null;
}

function httpsRequest(url, timeout = 15000) {
    return new Promise((resolve) => {
        const inicio = Date.now();

        const req = https.get(
            url,
            {
                timeout,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
                    "Connection": "close"
                }
            },
            (response) => {
                let data = "";

                response.setEncoding("utf8");

                response.on("data", chunk => {
                    data += chunk;

                    if (data.length > 50000) {
                        req.destroy();
                    }
                });

                response.on("end", () => {
                    resolve({
                        ok: true,
                        status: response.statusCode,
                        headers: response.headers,
                        url: response.url || url,
                        body: data.substring(0, 50000),
                        ms: Date.now() - inicio
                    });
                });
            }
        );

        req.on("timeout", () => {
            req.destroy();

            resolve({
                ok: false,
                error: "TIMEOUT",
                ms: Date.now() - inicio
            });
        });

        req.on("error", error => {
            resolve({
                ok: false,
                error: error.code || error.message,
                ms: Date.now() - inicio
            });
        });
    });
}

async function diagnosticarRed() {
    console.log("======================================");
    console.log("🔬 DIAGNÓSTICO DE RED SEP");
    console.log("======================================");

    const dominios = [
        "profesiones.sep.gob.mx",
        "cedulaprofesional.sep.gob.mx"
    ];

    for (const dominio of dominios) {
        try {
            const resultado = await dns.lookup(
                dominio,
                {
                    all: true
                }
            );

            console.log("🌐 DNS:", dominio);
            console.log(
                resultado.map(x => x.address)
            );
        } catch (error) {
            console.log(
                "❌ DNS ERROR:",
                dominio,
                error.message
            );
        }
    }

    console.log("======================================");
    console.log("🌐 HTTP PROFESIONES");
    console.log("======================================");

    const home = await httpsRequest(
        SEP_HOME,
        15000
    );

    console.log(home);

    console.log("======================================");
    console.log("🌐 HTTP CÉDULA");
    console.log("======================================");

    const cedula = await httpsRequest(
        SEP_CEDULA,
        15000
    );

    console.log(cedula);

    return {
        profesiones: {
            ok: home.ok,
            status: home.status,
            error: home.error,
            ms: home.ms
        },
        cedula: {
            ok: cedula.ok,
            status: cedula.status,
            error: cedula.error,
            ms: cedula.ms
        }
    };
}

async function abrirPaginaSEP() {
    const browser = await iniciarBrowser();

    const context = await browser.newContext({
        viewport: {
            width: 1366,
            height: 768
        },
        locale: "es-MX",
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();

    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);

    page.on("requestfailed", request => {
        const url = request.url();

        if (
            url.includes("sep.gob.mx")
        ) {
            console.log(
                "💥 REQUEST FAILED:",
                url
            );

            console.log(
                "   ERROR:",
                request.failure()?.errorText
            );
        }
    });

    page.on("response", response => {
        const url = response.url();

        if (
            url.includes("sep.gob.mx")
        ) {
            console.log(
                "⬅️",
                response.status(),
                url
            );
        }
    });

    console.log("======================================");
    console.log("🌐 ABRIENDO PROFESIONES SEP");
    console.log("======================================");

    const respuesta = await page.goto(
        SEP_HOME,
        {
            waitUntil: "domcontentloaded",
            timeout: 30000
        }
    );

    console.log(
        "📡 STATUS:",
        respuesta?.status()
    );

    console.log(
        "🌐 URL:",
        page.url()
    );

    console.log(
        "📄 TITLE:",
        await page.title()
    );

    await page.waitForTimeout(2000);

    return {
        page,
        context
    };
}

async function obtenerEnlaceConsulta(page) {
    const enlace = page.locator(
        'a[href="https://cedulaprofesional.sep.gob.mx/"]'
    ).first();

    if (await enlace.count()) {
        const href = await enlace.getAttribute(
            "href"
        );

        console.log(
            "🟢 Consulta Pública encontrada:",
            href
        );

        return href;
    }

    const enlaces = await page.locator("a").evaluateAll(
        elements =>
            elements.map(a => ({
                texto: a.innerText?.trim() || "",
                href: a.href || ""
            }))
    );

    const encontrado = enlaces.find(
        x =>
            x.href.includes(
                "cedulaprofesional.sep.gob.mx"
            ) ||
            x.texto.toLowerCase().includes(
                "consulta pública"
            )
    );

    if (encontrado) {
        console.log(
            "🟢 Consulta encontrada por análisis:",
            encontrado
        );

        return encontrado.href;
    }

    return null;
}

async function intentarConsulta(page) {
    console.log("======================================");
    console.log("🎯 INTENTANDO CONSULTA PÚBLICA");
    console.log("======================================");

    const href = await obtenerEnlaceConsulta(
        page
    );

    if (!href) {
        throw new Error(
            "No se encontró el enlace de Consulta Pública"
        );
    }

    console.log(
        "🔗 DESTINO:",
        href
    );

    console.log(
        "🌐 Intentando navegación..."
    );

    let respuesta = null;

    try {
        respuesta = await page.goto(
            href,
            {
                waitUntil: "commit",
                timeout: 15000
            }
        );

        console.log(
            "📡 RESPUESTA:",
            respuesta?.status()
        );

    } catch (error) {
        console.log(
            "⚠️ Navegación no completada:",
            error.message
        );
    }

    await page.waitForTimeout(3000);

    console.log(
        "🌐 URL ACTUAL:",
        page.url()
    );

    console.log(
        "📄 TITLE:",
        await page.title().catch(
            () => "SIN TITULO"
        )
    );

    const body = await page.locator("body")
        .innerText()
        .catch(() => "");

    console.log(
        "📄 BODY:",
        body.substring(0, 5000)
    );

    return {
        responseStatus:
            respuesta?.status() || null,
        url: page.url(),
        title: await page.title().catch(
            () => ""
        ),
        body: body.substring(0, 5000)
    };
}

async function buscarCampoCedula(page) {
    console.log(
        "🔎 Buscando campo de cédula..."
    );

    const selectores = [
        'input[name="cedula"]',
        'input[id="cedula"]',
        'input[name="numeroCedula"]',
        'input[name="numero_cedula"]',
        'input[name="numCedula"]',
        'input[placeholder*="cédula" i]',
        'input[placeholder*="cedula" i]',
        'input[aria-label*="cédula" i]',
        'input[aria-label*="cedula" i]',
        'input[type="text"]',
        'input[type="number"]'
    ];

    for (const selector of selectores) {
        try {
            const elemento = page.locator(
                selector
            ).filter({
                visible: true
            }).first();

            if (
                await elemento.count() &&
                await elemento.isVisible()
            ) {
                console.log(
                    "🟢 Campo encontrado:",
                    selector
                );

                return elemento;
            }
        } catch {}
    }

    const inputs = await page.locator(
        "input"
    ).evaluateAll(
        elements =>
            elements.map((input, index) => ({
                index,
                id: input.id,
                name: input.name,
                type: input.type,
                placeholder:
                    input.placeholder,
                aria:
                    input.getAttribute(
                        "aria-label"
                    ),
                visible:
                    !!(
                        input.offsetWidth ||
                        input.offsetHeight ||
                        input.getClientRects().length
                    )
            }))
    );

    console.log(
        "📋 INPUTS:",
        JSON.stringify(
            inputs,
            null,
            2
        )
    );

    const indice = inputs.findIndex(
        input =>
            input.visible &&
            (
                String(input.id)
                    .toLowerCase()
                    .includes("cedula") ||
                String(input.name)
                    .toLowerCase()
                    .includes("cedula") ||
                String(input.placeholder)
                    .toLowerCase()
                    .includes("cedula")
            )
    );

    if (indice >= 0) {
        return page.locator(
            "input"
        ).nth(indice);
    }

    return null;
}

async function buscarBoton(page) {
    const elementos = page.locator(
        "button, input, a"
    );

    const total = await elementos.count();

    for (let i = 0; i < total; i++) {
        try {
            const elemento =
                elementos.nth(i);

            if (!await elemento.isVisible()) {
                continue;
            }

            const texto = (
                await elemento
                    .innerText()
                    .catch(() => "")
            ).trim().toLowerCase();

            const value = (
                await elemento
                    .getAttribute("value")
                    .catch(() => "")
            )?.trim().toLowerCase();

            if (
                texto.includes("buscar") ||
                value?.includes("buscar") ||
                texto.includes("consultar") ||
                value?.includes("consultar")
            ) {
                console.log(
                    "🟢 Botón encontrado:",
                    texto || value
                );

                return elemento;
            }
        } catch {}
    }

    return null;
}

async function extraerResultado(page) {
    console.log(
        "🔎 Buscando resultado..."
    );

    await page.waitForTimeout(3000);

    const limite = Date.now() + 20000;

    while (Date.now() < limite) {
        try {
            const filas = page.locator(
                "tbody tr"
            );

            const total = await filas.count();

            if (total > 0) {
                const celdas =
                    await filas.first()
                        .locator("td")
                        .allTextContents();

                console.log(
                    "📋 RESULTADO:",
                    celdas
                );

                return {
                    success: true,
                    valida: true,
                    numeroCedula:
                        celdas[0]?.trim() || "",
                    nombre:
                        celdas[1]?.trim() || "",
                    apellidoPaterno:
                        celdas[2]?.trim() || "",
                    apellidoMaterno:
                        celdas[3]?.trim() || "",
                    genero:
                        celdas[4]?.trim() || "",
                    institucion:
                        celdas[5]?.trim() || "",
                    profesion:
                        celdas[6]?.trim() || "",
                    entidad:
                        celdas[7]?.trim() || "",
                    anioRegistro:
                        celdas[8]?.trim() || "",
                    fechaConsulta:
                        new Date().toISOString(),
                    fuente: "SEP"
                };
            }
        } catch {}

        const texto = await page.locator(
            "body"
        ).innerText().catch(() => "");

        const lower = texto.toLowerCase();

        if (
            lower.includes("no se encontraron") ||
            lower.includes("no se encontró") ||
            lower.includes("no encontrada") ||
            lower.includes("sin resultados")
        ) {
            return null;
        }

        await page.waitForTimeout(1000);
    }

    return null;
}

async function consultarCedula(cedula) {
    let context = null;

    try {
        const resultadoRed =
            await diagnosticarRed();

        console.log(
            "======================================"
        );
        console.log(
            "📊 RESULTADO RED"
        );
        console.log(
            "======================================"
        );
        console.log(
            JSON.stringify(
                resultadoRed,
                null,
                2
            )
        );

        if (
            !resultadoRed.cedula.ok
        ) {
            console.log(
                "⚠️ El dominio de consulta no responde por HTTPS."
            );

            return {
                success: false,
                valida: false,
                message:
                    "La Consulta Pública de la SEP no responde desde el servidor.",
                diagnostico:
                    resultadoRed
            };
        }

        const abierto =
            await abrirPaginaSEP();

        const page =
            abierto.page;

        context =
            abierto.context;

        await intentarConsulta(
            page
        );

        const campo =
            await buscarCampoCedula(
                page
            );

        if (!campo) {
            throw new Error(
                "No se encontró el campo de cédula"
            );
        }

        await campo.fill(
            String(cedula)
        );

        console.log(
            "✍️ Cédula escrita:",
            cedula
        );

        const boton =
            await buscarBoton(
                page
            );

        if (!boton) {
            throw new Error(
                "No se encontró el botón Buscar"
            );
        }

        await boton.click({
            force: true
        });

        console.log(
            "🔎 Consulta enviada"
        );

        return await extraerResultado(
            page
        );

    } finally {
        if (context) {
            await context.close().catch(
                () => {}
            );
        }
    }
}

app.post(
    "/validar-cedula",
    async (req, res) => {
        const {
            cedula
        } = req.body;

        console.log(
            "======================================"
        );
        console.log(
            "📥 SOLICITUD RECIBIDA:",
            cedula
        );
        console.log(
            "======================================"
        );

        if (
            !cedula ||
            !/^\d+$/.test(
                String(cedula)
            )
        ) {
            return res.status(400).json({
                success: false,
                valida: false,
                message:
                    "Número de cédula inválido"
            });
        }

        try {
            const resultado =
                await consultarCedula(
                    cedula
                );

            if (!resultado) {
                return res.json({
                    success: false,
                    valida: false,
                    message:
                        "Cédula no encontrada"
                });
            }

            return res.json(
                resultado
            );

        } catch (error) {
            console.error(
                "💥 ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                valida: false,
                message:
                    "Error al consultar SEP",
                error:
                    error.message
            });
        }
    }
);

app.get(
    "/diagnostico",
    async (req, res) => {
        try {
            const resultado =
                await diagnosticarRed();

            res.json({
                success: true,
                resultado
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error:
                    error.message
            });
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
                "❌ Error Chromium:",
                error.message
            );
        }
    }
);

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