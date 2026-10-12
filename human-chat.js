/* PrimeGuard human live chat (tawk.to) — shared by all non-homepage pages.
   The chat bubble shows by default; any element with [data-chat-open]
   or an href="#human-chat" link opens it directly. */
(function () {
  "use strict";
  window.Tawk_API = window.Tawk_API || {};
  var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
  s1.async = true;
  s1.src = "https://embed.tawk.to/6ac058de3e307f34bc156bb0/1k3vlm99r";
  s1.charset = "UTF-8";
  s1.setAttribute("crossorigin", "*");
  s0.parentNode.insertBefore(s1, s0);

  window.openHumanChat = function () {
    try {
      if (window.Tawk_API && Tawk_API.maximize) {
        Tawk_API.showWidget();
        Tawk_API.maximize();
        return;
      }
    } catch (e) {}
    window.open("https://tawk.to/chat/6ac058de3e307f34bc156bb0/1k3vlm99r", "_blank");
  };

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-chat-open]");
    if (t) { e.preventDefault(); window.openHumanChat(); return; }
    var a = e.target.closest('a[href="#human-chat"]');
    if (a) { e.preventDefault(); window.openHumanChat(); }
  });

  if (location.hash === "#human-chat") { setTimeout(window.openHumanChat, 1200); }
  window.addEventListener("hashchange", function () {
    if (location.hash === "#human-chat") window.openHumanChat();
  });
})();
