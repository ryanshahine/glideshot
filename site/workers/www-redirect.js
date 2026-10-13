// www.glideshot.xyz → glideshot.xyz: a permanent redirect that keeps the path and query.
// A separate Worker, so the main site can serve its files without running any code.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = "glideshot.xyz";
    return Response.redirect(url.toString(), 301);
  },
};
