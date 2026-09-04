# Save to Social Knowledge

`Save to Social Knowledge.shortcut` is an unsigned Apple Shortcut generated from the public Social
to Mealie shortcut. It accepts URLs and Safari web pages from the Apple share sheet, submits the URL
to Social Knowledge, and displays a confirmation.

The shortcut asks for the Social Knowledge `API_TOKEN` during import. Do not enter the OpenAI API
key, and do not share the configured shortcut because it will contain the application token.

Apple requires modified shortcut files to be signed on macOS before they can be imported. Download
the generated file to `~/Downloads`, then run:

```bash
shortcuts sign --mode anyone \
  --input "$HOME/Downloads/Save to Social Knowledge.shortcut" \
  --output "$HOME/Downloads/Save to Social Knowledge-signed.shortcut"

open "$HOME/Downloads/Save to Social Knowledge-signed.shortcut"
```

After import, enable **Show in Share Sheet** if it is not already enabled. With Shortcuts iCloud
sync enabled, the shortcut will also appear on the iPhone and iPad signed into the same Apple
Account.

Rebuild from an exported binary-plist template with:

```bash
python3 scripts/build-apple-shortcut.py \
  /path/to/template.shortcut \
  "shortcuts/Save to Social Knowledge.shortcut"
```
