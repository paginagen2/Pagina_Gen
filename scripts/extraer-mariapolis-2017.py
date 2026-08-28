import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cancionero" / "cancioneros" / "CancioneroMariapolis2017PRINT.pdf"
OUTPUT = ROOT / "cancionero" / "cancioneros" / "mariapolis-2017-publicado.json"
PENDING = ROOT / "cancionero" / "cancioneros" / "mariapolis-2017-pendientes.json"
REPORT = ROOT / "cancionero" / "cancioneros" / "mariapolis-2017-revision.json"
TITLE_RE = re.compile(r"^(\d{1,3})\s*-\s*(.+?)\s*$")
FOOTER_RE = re.compile(r"^CancioneroMariapolis2017\.indd\b")
METADATA_RE = re.compile(
    r"^(?:Texto|M[úu]sica|Versi[oó]n castellana)\s*:|^©\s*|^Del Salmo\b|^\(\s*Transp\.",
    re.IGNORECASE,
)
CHORD_TOKEN_RE = re.compile(
    r"^(Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?(?:m|maj|sus|dim|aug)?(?:\d+)?(?:/[A-Za-z#b0-9]+)?$",
    re.IGNORECASE,
)
NO_CHORD_SOURCE_NUMBERS = {12, 17, 18, 23, 25, 48, 52, 70, 78, 92, 118, 119}
DISTINGUISHED_TITLES = {
    19: "Aleluya I",
    20: "Aleluya II",
    43: "Santo I",
    44: "Santo II",
    45: "Santo III",
}


def plain(value):
    return "".join(character for character in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(character) != "Mn")


def normalized_identity(value):
    return re.sub(r"[^a-z0-9]+", " ", plain(value)).strip()


def sentence_title(value):
    value = re.sub(r"\s+", " ", value.strip())
    if not value:
        return value
    lowered = value.lower()
    return lowered[0].upper() + lowered[1:]


TITLE_FIXES = {
    "cancion de maria": "Canción de María",
    "eucaristia": "Eucaristía",
    "en mi getsemani": "En mi Getsemaní",
    "haciendote pan": "Haciéndote pan",
    "quedate junto a mi": "Quédate junto a mí",
    "salve maria": "Salve María",
    "al dios que vive en mi": "Al Dios que vive en mí",
    "nina de nazaret": "Niña de Nazaret",
    "renuevame senor": "Renuévame, Señor",
    "santa maria del camino": "Santa María del camino",
}

ARTIST_FIXES = {
    "gen verde": "Gen Verde",
    "gen rosso": "Gen Rosso",
    "gen filadelfia": "Gen Filadelfia",
}

# Créditos administrativos definidos para las canciones cuya edición impresa
# no incluye autor o intérprete visible.
ARTIST_OVERRIDES = {
    1: "Misa Mariápolita",
    29: "Misa Mariápolita",
    83: "Misa Mariápolita",
    47: "Misa Mariápolita",
    107: "Misa Mariápolita",
    106: "Misa Mariápolita",
    96: "Misa Mariápolita",
    34: "Misa Mariápolita",
    66: "Misa Mariápolita",
    103: "Misa Mariápolita",
    112: "Misa Mariápolita",
    16: "Misa",
    39: "Misa",
    41: "Misa",
    49: "Misa",
    93: "Misa",
    114: "Misa",
    115: "Misa",
    116: "Misa",
    117: "Misa",
}


def clean_title(value):
    value = sentence_title(value)
    return TITLE_FIXES.get(normalized_identity(value), value)


def clean_artist(value):
    value = re.sub(r"\s+", " ", value.strip())
    return ARTIST_FIXES.get(normalized_identity(value), value)


def visible_lines(page):
    text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
    return [line.strip() for line in text.splitlines() if line.strip() and not FOOTER_RE.match(line.strip())]


def find_starts(pdf):
    starts = []
    for page_index, page in enumerate(pdf.pages[:188]):
        lines = visible_lines(page)
        match_index = next((index for index, line in enumerate(lines[:10]) if TITLE_RE.match(line)), None)
        if match_index is None:
            continue
        match = TITLE_RE.match(lines[match_index])
        title_parts = [match.group(2).strip()]
        cursor = match_index + 1
        if cursor < len(lines):
            candidate = lines[cursor]
            is_upper_title = (
                candidate == candidate.upper()
                and any(character.isalpha() for character in candidate)
                and not candidate.startswith("(")
                and not METADATA_RE.match(candidate)
                and not candidate.lower().startswith("intro")
                and not all(CHORD_TOKEN_RE.match(token) for token in candidate.split())
            )
            if is_upper_title:
                title_parts.append(candidate)
                cursor += 1
        starts.append({
            "page": page_index,
            "number": int(match.group(1)),
            "title": clean_title(" ".join(title_parts)),
            "header_line_count": cursor - match_index,
            "title_continuations": title_parts[1:],
        })
    return starts


def author_from_page(page, start):
    lines = visible_lines(page)
    title_index = next(index for index, line in enumerate(lines[:10]) if TITLE_RE.match(line))
    cursor = title_index + start["header_line_count"]
    credits = []
    parenthetical = ""
    copyright_artist = ""
    while cursor < len(lines):
        line = lines[cursor]
        if line.startswith("(") and line.endswith(")") and not re.search(r"Transp\.", line, re.IGNORECASE):
            parenthetical = line[1:-1].strip()
            cursor += 1
            continue
        if re.match(r"^(?:Texto|M[úu]sica)\s*:", line, re.IGNORECASE):
            key, value = line.split(":", 1)
            credits.append((plain(key), value.strip()))
            cursor += 1
            continue
        copyright_match = re.match(r"^©\s*(.+?)(?:\s+\d{4})?$", line)
        if copyright_match:
            copyright_artist = copyright_match.group(1).strip()
            cursor += 1
            continue
        if METADATA_RE.match(line):
            cursor += 1
            continue
        break
    if parenthetical:
        parenthetical = re.sub(r"\s*-\s*Texto de .*$", "", parenthetical, flags=re.IGNORECASE).strip()
        return parenthetical
    if copyright_artist:
        return copyright_artist
    music = next((value for key, value in credits if key == "musica"), "")
    return music


def layout_lines(page):
    text = page.extract_text(x_tolerance=1, y_tolerance=3, layout=True) or ""
    lines = [line.rstrip() for line in text.splitlines()]
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if FOOTER_RE.match(stripped) or re.fullmatch(r"\d{1,3}", stripped):
            continue
        cleaned.append(line)
    nonempty = [line for line in cleaned if line.strip()]
    margin = min((len(line) - len(line.lstrip(" ")) for line in nonempty), default=0)
    return [line[margin:].rstrip() if len(line) >= margin else "" for line in cleaned]


def strip_first_page_header(lines, start):
    title_index = next(index for index, line in enumerate(lines) if TITLE_RE.match(line.strip()))
    del lines[title_index]
    cursor = title_index
    for continuation in start.get("title_continuations", []):
        while cursor < len(lines) and not lines[cursor].strip():
            del lines[cursor]
        if cursor < len(lines) and re.sub(r"\s+", " ", lines[cursor].strip()) == re.sub(r"\s+", " ", continuation):
            del lines[cursor]
    while cursor < len(lines):
        stripped = lines[cursor].strip()
        if not stripped:
            del lines[cursor]
            continue
        if (
            (stripped.startswith("(") and stripped.endswith(")"))
            or METADATA_RE.match(stripped)
        ):
            del lines[cursor]
            continue
        break
    return lines


def compact_blank_lines(lines):
    result = []
    blank = False
    for line in lines:
        line = line.rstrip()
        if not line.strip():
            if result and not blank:
                result.append("")
            blank = True
            continue
        result.append(line)
        blank = False
    while result and not result[-1]:
        result.pop()
    return result


def extract_body(pdf, start, next_start):
    end_page = (next_start["page"] - 1) if next_start else 187
    all_lines = []
    for page_index in range(start["page"], end_page + 1):
        lines = layout_lines(pdf.pages[page_index])
        if page_index == start["page"]:
            lines = strip_first_page_header(lines, start)
        lines = compact_blank_lines(lines)
        if all_lines and lines:
            all_lines.append("")
        all_lines.extend(lines)
    body = "\n".join(compact_blank_lines(all_lines)).strip()
    body = body.replace("queremo8s", "queremos")
    # En algunas líneas de acordes el PDF pegó dos símbolos consecutivos
    # (por ejemplo Mi4Mi o La4La). Se recupera el espacio tipográfico perdido.
    body = re.sub(r"\b(Do|Re|Mi|Fa|Sol|La|Si)(\d+)(?=(?:Do|Re|Mi|Fa|Sol|La|Si)\b)", r"\1\2 ", body)
    return body


def infer_tone(body):
    intro = re.search(r"^\s*Intro[.:]?\s*(.+)$", body, re.MULTILINE | re.IGNORECASE)
    candidates = [intro.group(1)] if intro else []
    candidates.extend(line.strip() for line in body.splitlines())
    for candidate in candidates:
        tokens = [token.strip("(),.;:") for token in candidate.split()]
        chord = next((token for token in tokens if CHORD_TOKEN_RE.match(token)), "")
        if chord:
            return re.match(r"^(Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?", chord, re.IGNORECASE).group(0)
    return ""


def existing_identities():
    path = ROOT / "datos" / "cancionero" / "buscar.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        (normalized_identity(song.get("titulo", "")), normalized_identity(song.get("artista", "")))
        for song in data.get("canciones", [])
    }


def main():
    with pdfplumber.open(SOURCE) as pdf:
        starts = find_starts(pdf)
        songs = []
        for index, start in enumerate(starts):
            body = extract_body(pdf, start, starts[index + 1] if index + 1 < len(starts) else None)
            artist = ARTIST_OVERRIDES.get(
                start["number"],
                clean_artist(author_from_page(pdf.pages[start["page"]], start)),
            )
            songs.append({
                "_sourceNumber": start["number"],
                "coleccion": "canciones",
                "titulo": DISTINGUISHED_TITLES.get(start["number"], start["title"]),
                "artista": artist,
                "letra": body,
                "tono": infer_tone(body),
                "idioma": "Portugués" if start["number"] in {29, 74} else ("Italiano" if start["number"] in {97, 119} else "Español"),
                "categoria": "misa",
                "estado": "publicado",
            })

    all_songs = songs
    songs_with_chords = [song for song in all_songs if song["_sourceNumber"] not in NO_CHORD_SOURCE_NUMBERS]
    songs = [song for song in songs_with_chords if song["artista"]]
    pending_artist = [song for song in songs_with_chords if not song["artista"]]
    existing = existing_identities()
    duplicate_existing = [song for song in songs if (normalized_identity(song["titulo"]), normalized_identity(song["artista"])) in existing]
    internal = {}
    for song in songs:
        internal.setdefault((normalized_identity(song["titulo"]), normalized_identity(song["artista"])), []).append(song["titulo"])
    duplicate_internal = [titles for titles in internal.values() if len(titles) > 1]
    report = {
        "source": SOURCE.name,
        "detected": len(all_songs),
        "with_chords": len(songs_with_chords),
        "ready_to_publish": len(songs),
        "without_artist": [{"number": song["_sourceNumber"], "title": song["titulo"]} for song in pending_artist],
        "without_tone": [{"number": song["_sourceNumber"], "title": song["titulo"]} for song in songs if not song["tono"]],
        "duplicate_existing": [{"title": song["titulo"], "artist": song["artista"]} for song in duplicate_existing],
        "duplicate_internal": duplicate_internal,
        "excluded_without_chords": [
            {"number": song["_sourceNumber"], "title": song["titulo"], "artist": song["artista"]}
            for song in all_songs if song["_sourceNumber"] in NO_CHORD_SOURCE_NUMBERS
        ],
    }
    public_songs = [{key: value for key, value in song.items() if key != "_sourceNumber"} for song in songs]
    pending_songs = [
        {
            **{key: value for key, value in song.items() if key != "_sourceNumber"},
            "estado": "pendiente",
            "observacionRevision": "Falta verificar artista o autor en la fuente",
        }
        for song in pending_artist
    ]
    OUTPUT.write_text(json.dumps(public_songs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    PENDING.write_text(json.dumps(pending_songs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    json.loads(OUTPUT.read_text(encoding="utf-8"))
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
