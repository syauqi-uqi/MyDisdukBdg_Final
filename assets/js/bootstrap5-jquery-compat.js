/* Small compatibility shim to provide jQuery-style .modal() and .collapse() calls
   when using Bootstrap 5 (which no longer provides jQuery plugins).
   This keeps the existing app.js code working with minimal changes. */
(function ($) {
  if (typeof bootstrap === 'undefined' || typeof $ === 'undefined') {
    return;
  }

  // Modal plugin shim: $(selector).modal(action)
  $.fn.modal = function (action) {
    var args = arguments;
    return this.each(function () {
      var el = this;
      var inst = bootstrap.Modal.getInstance(el);
      if (!inst) {
        inst = new bootstrap.Modal(el);
      }
      // Trigger jQuery-style events so old code that listens to 'show.bs.modal' etc. works
      if (!action || action === 'toggle') {
        $(el).trigger('show.bs.modal');
        inst.toggle();
        $(el).trigger('shown.bs.modal');
      } else if (action === 'show') {
        $(el).trigger('show.bs.modal');
        inst.show();
        $(el).trigger('shown.bs.modal');
      } else if (action === 'hide') {
        $(el).trigger('hide.bs.modal');
        inst.hide();
        $(el).trigger('hidden.bs.modal');
      }
    });
  };

  // Collapse plugin shim: $(selector).collapse(action)
  $.fn.collapse = function (action) {
    return this.each(function () {
      var el = this;
      var inst = bootstrap.Collapse.getInstance(el);
      if (!inst) {
        // Do not auto-toggle on creation unless action is undefined
        inst = new bootstrap.Collapse(el, { toggle: false });
      }
      if (!action || action === 'toggle') {
        $(el).trigger('show.bs.collapse');
        inst.toggle();
        $(el).trigger('shown.bs.collapse');
      } else if (action === 'show') {
        $(el).trigger('show.bs.collapse');
        inst.show();
        $(el).trigger('shown.bs.collapse');
      } else if (action === 'hide') {
        $(el).trigger('hide.bs.collapse');
        inst.hide();
        $(el).trigger('hidden.bs.collapse');
      }
    });
  };
})(jQuery);
