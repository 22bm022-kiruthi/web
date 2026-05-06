from pathlib import Path
import json


def parse_tsv(path: Path):
    text = path.read_text(encoding='utf-8')
    metadata = {}
    data = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t') if '\t' in line else line.split()
        # detect numeric start = spectral data
        try:
            float(parts[0])
            # spectral row
            if len(parts) >= 2:
                wn = int(float(parts[0]))
                val = float(parts[1])
                data.append((wn, val))
        except Exception:
            # metadata
            if len(parts) >= 2:
                metadata[parts[0]] = parts[1]
            else:
                metadata[parts[0]] = ''
    return metadata, data


def combine_ethanol():
    root = Path('.')
    in_dir = root / 'dataset' / 'Ethanol'
    out_dir = root / 'public' / 'samples'
    out_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(in_dir.glob('*.tsv'))
    all_wn = set()
    samples = []
    for f in files:
        meta, data = parse_tsv(f)
        wn_vals = {wn: val for wn, val in data}
        all_wn.update(wn_vals.keys())
        samples.append({'file': str(f.name), 'meta': meta, 'wn_vals': wn_vals})

    wavenumbers = sorted(all_wn)

    # Choose common metadata keys to include
    keys = ['DeviceSN', 'LaserWavelength_nm', 'Exposure_ms', 'GainMultiplier', 'LaserCurrent_mA', 'LaserPower_mW', 'RepetitionCount', 'Tags']

    # Write CSV
    csv_path = out_dir / 'ethanol_combined.csv'
    with csv_path.open('w', encoding='utf-8') as out:
        header = ['file'] + keys + [str(wn) for wn in wavenumbers]
        out.write(','.join(header) + '\n')
        for s in samples:
            row = [s['file']]
            for k in keys:
                row.append(s['meta'].get(k, ''))
            for wn in wavenumbers:
                v = s['wn_vals'].get(wn, '')
                row.append(str(v) if v != '' else '')
            out.write(','.join(row) + '\n')

    # Write JSON (pretty)
    json_path = out_dir / 'ethanol.json'
    out_list = []
    for s in samples:
        arr = [s['wn_vals'].get(wn, None) for wn in wavenumbers]
        out_list.append({'file': s['file'], 'meta': s['meta'], 'wavenumbers': wavenumbers, 'intensities': arr})
    json_path.write_text(json.dumps(out_list, indent=2), encoding='utf-8')

    print('Wrote', csv_path, 'and', json_path)


if __name__ == '__main__':
    combine_ethanol()
