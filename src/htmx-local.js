// htmx-local.js ©2025 jason punyon MIT <3 
import { default as htmx } from "htmx.org";
import { Router } from "tiny-request-router";
import { sqlite3Worker1Promiser as promiserFactory } from '@sqlite.org/sqlite-wasm';
import Mustache from "mustache";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

(function () {
    // XMLHttpRequest patch. Save the method and requestURL for later.
    const open = xhr => (...args) => {
        xhr._method = args[0];
        xhr._requestURL = args[1];
        return xhr.open.apply(xhr, args);
    };

    // Helper. Save the response and dispatch the load event.
    const setResponse = target => response => {
        target._response = response
        target.dispatchEvent(new Event("load"));
    };

    // XMLHttpRequest patch  
    // Instead of sending XMLHttpRequests to a server, dispatch them against a TinyRequestRouter.
    const send = target => body => {
        const urlBase = new URL(window.location.href).origin;
        const url = new URL(target._requestURL, urlBase);
        const match = htmx.router.match(target._method, url.pathname);
        if (match) {
            const context = {
                ...(body ? Object.fromEntries(new URLSearchParams(body).entries()) : {}),
                ...match.params,
                ...Object.fromEntries(url.searchParams.entries()),
                requestURL: url.pathname
            };
            const response = match.handler(context);
            if (response instanceof Promise) {
                response.then(setResponse(target));
            } else {
                setResponse(target)(response);
            }
        } else {
            setResponse(target)("404");
        }
    };

    // Helper. Get the type of the response. Should be object or string
    // When it's an object we expect that that object has a .body
    // When it's a string it's just a string
    const getResponseType = target => typeof (target._response);

    // XMLHttpRequest patch.
    const getResponseHeader = target => header =>
        (getResponseType(target) === 'object' && header in target._response.headers)
            ? target._response.headers[header]
            : null;

    // XMLHttpRequest patch
    const getAllResponseHeaders = target => () => getResponseType(target) === 'object'
        ? Object.keys(target._response.headers)
            .map(k => `${k}: ${target._response.headers[k]}`)
            .join("\r\n")
        : "";

    // XMLHttpRequest patch
    const getResponse = target => {
        switch (getResponseType(target)) {
            case "string": return target._response;
            case "object": return target._response.body;
        }
    };

    const opendb = (async function () {
        var myResolve;
        const _ready = new Promise((resolve) => {
            myResolve = resolve;
        });

        console.log("Making worker.");
        const w = new Worker(new URL('./sqlite-worker.js', import.meta.url), { type: "module" });

        const promiser = await promiserFactory({
            onready: () => myResolve(),
            worker: w
        });
        await _ready;

        return async function (dbname) {
            let dbId;
            if (dbname != ":memory:") {
                dbId = await promiser('open', { 'filename': `file:/${dbname}?vfs=opfs-sahpool` });
            } else {
                dbId = await promiser('open', { 'filename': `file::memory:` });
            }

            return {
                exec: async (sql, params) => await promiser('exec', { 'sql': sql, dbId: dbId.dbId, rowMode: "object", bind: params }),
                close: async () => await promiser('close', { dbId: dbId.dbId }),
                export: async () => (await promiser("export", { dbId: dbId.dbId })).result.byteArray
            };
        }
    })();

    const _db = async (dbname, cb) => {
        const db = await (await opendb)(dbname);
        try {
            if (htmx.db.migrate != null) {
                const migrate = htmx.db.migrate;
                htmx.db.migrate = null;
                await migrate(db);
            }
            return await cb(db);
        } finally {
            await db.close();
        }
    };

    window.onfocus = async function () {
        await _db(":memory:", async db => {
            await db.exec("-- ARRIVING");
        });
    };

    window.onblur = async function () {
        await _db(":memory:", async db => {
            await db.exec("-- LEAVING");
        });
    }

    const importDb = async (name, byteArray) => {
        await _db(":memory:", async db => {
            await db.exec("-- IMPORT THE SHIT", { name: `/${name}`, byteArray });
        });
    };

    const exportDb = async (name) => {
        const le_export = await _db(name, async d => await d.export());
        const blob = new Blob([le_export], { type: "application/x-sqlite3" });

        const a = document.createElement('a');
        document.body.appendChild(a);
        a.href = window.URL.createObjectURL(blob);
        a.download = name;
        a.addEventListener('click', function () {
            setTimeout(function () {
                window.URL.revokeObjectURL(a.href);
                a.remove();
            }, 500);
        });
        a.click();
    }

    const exportDbS3 = async (name, endpoint, accessKeyId, secretAccessKey, Bucket, Key) => {
        const client = new S3Client({
            region: "auto",
            endpoint: endpoint,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });
        const command = new PutObjectCommand({
            Bucket,
            Key,
            Body: await _db(name, async d => await d.export())
        });
        const response = await client.send(command);
        console.log(response);
    }

    const view = (template_id, data) => ({
        body: JSON.stringify(data ?? {}),
        headers: {
            "hx-template": template_id,
        }
    });

    const redirect = (url) => ({
        body: "{}",
        headers: {
            "HX-Location": url
        }
    });

    // The extension
    htmx.defineExtension('htmx-local', {
        init: function (api) {
            // Setup the router
            htmx.router = new Router();

            // XMLHttpRequest traps
            const handler = {
                get: function (target, prop) {
                    switch (prop) {
                        case "open": return open(target);
                        case "send": return send(target);
                        case "responseText":
                        case "response": return getResponse(target);
                        case "status": return 200;
                        case "statusText": return "OK";
                        case "getResponseHeader": return getResponseHeader(target);
                        case "getAllResponseHeaders": return getAllResponseHeaders(target);
                        default:
                            const value = target[prop];
                            return typeof value === "function" ? value.bind(target) : value;
                    }
                },
                set: function (target, prop, value) {
                    if (prop == "onload") {
                        value = value.bind(this);
                    }
                    target[prop] = value;
                    return true;
                }
            };

            // Patch XMLHttpRequest
            const OriginalXMLHttpRequest = XMLHttpRequest;
            XMLHttpRequest = function () {
                const xhr = new OriginalXMLHttpRequest();
                const xhrProxy = new Proxy(xhr, handler);
                return xhrProxy;
            }

            htmx.db = _db;
            htmx.db.migrate = null;
            htmx.db.import = importDb;
            htmx.db.export = exportDb;
            htmx.db.exportS3 = exportDbS3;
            htmx.view = view;
            htmx.redirect = redirect;
        },
        transformResponse: function (text, xhr, elt) {
            // 1a the element referenced in hx-target has a template
            // 1b the element has a template
            // 1c the response has an HX-Template header

            // If 1a or 1b or 1 c then interpret the response as JSON and render the mustache template.
            // Otherwise return the response unchanged

            // cribbed/modified from the client-side-templates htmx extension 
            // https://github.com/bigskysoftware/htmx-extensions/blob/main/src/client-side-templates/client-side-templates.js
            // (BSD Zero clause)
            const targetElt = elt.getAttribute("hx-target")
            if (targetElt && targetElt != "this") {
                elt = htmx.find(targetElt)
            }

            const templateId = elt?.getAttribute("hx-template") ?? xhr?.getResponseHeader("hx-template");

            if (templateId) {
                var template = htmx.find('#' + templateId)
                if (template) {
                    var data = JSON.parse(text)
                    if (data instanceof Array) {
                        return Mustache.render(template.innerHTML, { data })
                    }
                    return Mustache.render(template.innerHTML, data)
                }

                throw new Error('Unknown template: ' + templateId)
            }

            return text;
        }
    });
}());

window.htmx = htmx;
export { htmx };