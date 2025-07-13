# htmx-local
## whole-ass web-apps within-abrowser

In short, htmx-local = [htmx](https://htmx.org) + [tiny-request-router](https://github.com/berstend/tiny-request-router) + [sqlite](https://www.sqlite.org/wasm/doc/trunk/index.md). You can use it to build webapps that run locally in your browser using nothing but <span class="text-red-400">html</span>, <span class="text-green-400">css</span>, <span class="text-blue-400">javascript</span> and <span class="text-yellow-400">sql</span>. You can serve those apps from any static file server.

## how does it work?

htmx uses `XMLHttpRequest` for all its server requests. The bulk of htmx-local's ~250 lines of code is spent caressing `XMLHttpRequest` just right so that instead of sending requests to a server, it runs them against a `tiny-request-router` that you can configure to respond however you'd like.

## hello, world!

Here's a quick hello world. 

```html
<!DOCTYPE html>
<script src="/htmx-local.js"></script>
<script>
    const { router } = htmx;
    router.get("/", () => "Hello, world!");
</script>
<body hx-get="/" hx-trigger="load">
</body>
```

First we add a script tag to load htmx-local. Then in the next script tag we pull out the router from htmx, and set it up to respond to GET requests to `/` with "Hello, world!". Finally we add the body tag with attributes hx-get='/' and hx-trigger="load". This means "when the page loads, do a GET to '/' and put the results in the body tag". With htmx-local, that GET '/' will run against the router, and the page will display "Hello, world!".
