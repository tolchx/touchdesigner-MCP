"""Example TouchDesigner API plugin.

Plugins are Python files placed in the plugins/ directory.
Each plugin module should contain at least one class with a
'register_endpoints(api_instance, debug_print)' method.

The register_endpoints method receives the TouchDesignerAPI instance
and a debug_print function. It can:
  - Add new handler methods to the instance
  - Add new route matching logic
  - Override existing behaviour

Example:
    class MyPlugin:
        def register_endpoints(self, api, debug):
            debug("MyPlugin registering endpoints...")
            # Add a new handler
            def my_handler(request, response):
                response["data"] = '{"hello": "world"}'
                return response
            api.my_handler = my_handler
"""

import json


class ExamplePlugin:
    """Example plugin that adds a /plugin/hello endpoint."""

    def register_endpoints(self, api, debug):
        """Register custom endpoints with the TouchDesignerAPI instance.

        Args:
            api: The TouchDesignerAPI instance (self in OnHTTPRequest).
            debug: A callable for debug printing.
        """
        debug("[ExamplePlugin] Registering /plugin/hello endpoint")

        # Store reference so handler can use it
        api._example_plugin_loaded = True

        # Monkey-patch a handler method onto the instance
        def _handle_plugin_hello(request, response):
            """Return a greeting from the plugin system."""
            data = {
                "plugin": "ExamplePlugin",
                "message": "Hello from the TD-MCP plugin system!",
                "status": "loaded",
                "version": "1.0.0",
            }
            response["Content-Type"] = "application/json"
            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(data, ensure_ascii=False)
            return response

        api._handle_plugin_hello = _handle_plugin_hello

        # Monkey-patch OnHTTPRequest to add our route
        original_on_request = api.OnHTTPRequest

        def patched_on_request(dat, request, response):
            uri = request.get("uri", "")
            if uri == "/plugin/hello":
                return api._handle_plugin_hello(request, response)
            # Fall through to original handler
            return original_on_request(dat, request, response)

        api.OnHTTPRequest = patched_on_request
        debug("[ExamplePlugin] Endpoint /plugin/hello registered")


class SampleDataPlugin:
    """Example plugin that exposes a /plugin/status endpoint."""

    def register_endpoints(self, api, debug):
        """Register a /plugin/status endpoint."""

        def _handle_plugin_status(request, response):
            """Return plugin system status."""
            data = {
                "plugins_loaded": getattr(api, "_plugins_loaded", False),
                "example_enabled": getattr(api, "_example_plugin_loaded", False),
                "note": "Plugin system is operational",
            }
            response["Content-Type"] = "application/json"
            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(data, ensure_ascii=False)
            return response

        api._handle_plugin_status = _handle_plugin_status

        original_on_request = api.OnHTTPRequest

        def patched_on_request(dat, request, response):
            uri = request.get("uri", "")
            if uri == "/plugin/status":
                return api._handle_plugin_status(request, response)
            return original_on_request(dat, request, response)

        api.OnHTTPRequest = patched_on_request
        debug("[SampleDataPlugin] Endpoint /plugin/status registered")
