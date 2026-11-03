Logo art drop-in
================

ship.png
--------

The bundled logo. White strokes on a black field; it is drawn as an alpha mask
and recoloured to the current theme, so the exact colours in the file do not
matter, only how bright each pixel is. Replace this file to change the logo, or
drop an ascii-art .html in (below) to override it at runtime.

The Windows icon is generated from it:
    powershell -ExecutionPolicy Bypass -File tools/make-icon.ps1 ui\assets\ship.png

Put a coloured ascii-art .html file here named either:

    logo.html
    ascii-art.html

PiratesShip parses it on start (the coloured <span> grid inside <pre>) and uses
it as the wordmark, pixel for pixel. Near-black cells are treated as background,
so a white-on-black render shows its strokes instead of a black block.

You can also drag the same file anywhere onto the app window at runtime; that
caches it to %APPDATA%\PiratesShip\logo-art.json so it survives a restart.
`/logo reset` in the app returns to the built-in 7x9 wordmark.
