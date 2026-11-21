"""Render a streak card from the same public daily counts shown on GitHub."""
import argparse
from datetime import date, datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

INDIA = timezone(timedelta(hours=5, minutes=30), 'Asia/Kolkata')
DAY = timedelta(days=1)


def get(url, token=None):
    headers = {'Accept-Language': 'en-US', 'User-Agent': 'portfolio-streak-card/1.0'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = Request(url, headers=headers)
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                return response.read().decode('utf-8')
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        sleep(2 ** (attempt + 1))


class Calendar(HTMLParser):
    """Match each dated cell to its explicit accessible count and the yearly total."""
    def __init__(self):
        super().__init__()
        self.cells = {}
        self.tips = {}
        self.heading = ''
        self.field = None
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'td' and 'data-date' in a:
            self.cells[a['id']] = date.fromisoformat(a['data-date'])
        elif tag == 'h2' and a.get('id') == 'js-contribution-activity-description':
            self.field = ('h2', None)
            self.chunks = []
        elif tag == 'tool-tip' and 'for' in a:
            self.field = ('tool-tip', a['for'])
            self.chunks = []

    def handle_data(self, text):
        if self.field:
            self.chunks.append(text)

    def handle_endtag(self, tag):
        if not self.field or tag != self.field[0]:
            return
        content = ' '.join(''.join(self.chunks).split())
        if tag == 'h2':
            self.heading = content
        else:
            self.tips[self.field[1]] = content
        self.field = None
        self.chunks = []

    def validated_days(self, year, through):
        heading = re.fullmatch(r'(No|[\d,]+) contributions? in (\d{4})', self.heading)
        if not heading or int(heading[2]) != year:
            raise ValueError(f'Unrecognized contribution calendar for {year}')
        counts = {}
        for key, day in self.cells.items():
            if day.year != year:
                continue
            tip = self.tips.get(key, '')
            count = re.match(r'^(No|[\d,]+) contributions? on ', tip)
            if not count or day in counts:
                raise ValueError(f'Missing or duplicate contribution count for {day}')
            counts[day] = 0 if count[1] == 'No' else int(count[1].replace(',', ''))
        first = date(year, 1, 1)
        expected = {first + DAY*i for i in range((through-first).days+1)}
        if not expected.issubset(counts):
            raise ValueError(f'Incomplete contribution calendar for {year}')
        total = 0 if heading[1] == 'No' else int(heading[1].replace(',', ''))
        if sum(counts.values()) != total:
            raise ValueError(f'Calendar total disagrees with daily counts for {year}')
        return {day: counts[day] for day in sorted(expected)}


def contributions(user, today):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}', user):
        raise ValueError('Invalid GitHub username')
    # A workflow token may increase the REST rate limit. Calendar requests are
    # always anonymous so the card can display only publicly visible activity.
    info = json.loads(get('https://api.github.com/users/'+user, os.getenv('GITHUB_TOKEN')))
    created = date.fromisoformat(info['created_at'][:10])
    if created > today:
        raise ValueError('Account creation is later than the requested calendar')
    days = {}
    for year in range(created.year, today.year+1):
        through = min(today, date(year, 12, 31))
        source = f'https://github.com/users/{user}/contributions?from={year}-01-01&to={through}'
        calendar = Calendar()
        calendar.feed(get(source))
        calendar.close()
        days.update(calendar.validated_days(year, through))
    return created, days


def streaks(days, today):
    last = None
    longest = current = (None, None, 0)
    for day, count in sorted(days.items()):
        if day > today or not count:
            continue
        length = current[2]+1 if last and day-last == DAY else 1
        current = (day - (length-1)*DAY, day, length)
        if length > longest[2]:
            longest = current
        last = day
    if last is None or today-last > DAY:
        current = (None, None, 0)
    return current, longest


def date_label(day, today):
    label = f'{day:%b} {day.day}'
    return label if day.year == today.year else f'{label}, {day.year}'


def range_label(streak, today):
    start, end, length = streak
    if not length:
        return '—'
    if start == end:
        return date_label(start, today)
    return f'{date_label(start, today)} - {date_label(end, today)}'


def render(user, created, days, today):
    current, longest = streaks(days, today)
    total = sum(days.values())
    # Match the existing navy, lilac and rose card and its three-column layout.
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="550" height="195" viewBox="0 0 550 195" role="img" aria-labelledby="title description">
  <title id="title">{escape(user)}'s GitHub activity</title>
  <desc id="description">{total:,} total contributions. Current streak {current[2]} days. Longest streak {longest[2]} days.</desc>
  <style>
    text {{ font-family: "Segoe UI", Ubuntu, sans-serif; text-anchor: middle; }}
    .value {{ font-size: 28px; font-weight: 700; fill: #ffdcb8; }}
    .label {{ font-size: 14px; fill: #f4f2ff; }}
    .period {{ font-size: 12px; fill: #c8ccdf; }}
    @media (prefers-reduced-motion: no-preference) {{
      .stats {{ animation: appear .45s ease-out; }}
      @keyframes appear {{ from {{ opacity: .55; }} to {{ opacity: 1; }} }}
    }}
  </style>
  <rect x=".5" y=".5" width="549" height="194" rx="4" fill="#121529" stroke="#585777"/>
  <path d="M183.3 28v142 M366.7 28v142" stroke="#434565" fill="none"/>
  <g class="stats">
    <text x="91.7" y="80" class="value">{total:,}</text>
    <text x="91.7" y="116" class="label">Total Contributions</text>
    <text x="91.7" y="146" class="period">{date_label(created,today)} - Present</text>
    <path d="M263 33a40 40 0 1 0 24 0" fill="none" stroke="#b8baff" stroke-width="5"/>
    <path d="M276 20c1 6-6 9-4 14-2-1-3-3-3-5-4 5-3 12 3 14 9 3 14-8 8-13 0 3-1 4-3 5 2-5 3-9-1-15Z" fill="#f3bdcd"/>
    <text x="275" y="80" class="value" style="fill:#f4f2ff">{current[2]}</text>
    <text x="275" y="140" class="label" font-weight="700">Current Streak</text>
    <text x="275" y="166" class="period">{range_label(current,today)}</text>
    <text x="458.3" y="80" class="value">{longest[2]}</text>
    <text x="458.3" y="116" class="label">Longest Streak</text>
    <text x="458.3" y="146" class="period">{range_label(longest,today)}</text>
  </g>
</svg>
'''


def update(user, output, today):
    created, days = contributions(user, today)
    data = render(user, created, days, today).encode('utf-8')
    if output.exists() and output.read_bytes() == data:
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, delete=False) as temp:
        temp.write(data)
    try:
        Path(temp.name).replace(output)
    finally:
        Path(temp.name).unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    update(args.user, args.output, datetime.now(INDIA).date())
