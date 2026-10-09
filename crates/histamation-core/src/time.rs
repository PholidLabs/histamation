//! Histamation time model (contract §3) — a line-for-line port of
//! `packages/engine/src/time.ts`.
//!
//! A `When` is an EDTF (ISO 8601-2) subset:
//!
//! ```text
//! point     1825 | 1825-07 | 1825-07-20 | 1825-07-20T14:30[:05]
//! qualifier ? uncertain, ~ approximate, % both
//! interval  A/B, with ".." for an open end
//! ```
//!
//! Years use astronomical numbering (`0000` = 1 BCE, `-0043` = 44 BCE), four digits.
//!
//! Everything resolves to **ticks**: `i64` seconds since 1970-01-01T00:00:00 in the
//! proleptic Gregorian calendar, no time zone, negative before 1970.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Seconds since 1970-01-01T00:00:00, proleptic Gregorian, no time zone.
///
/// Signed on purpose: every campaign in the corpus is before 1970, so an unsigned
/// epoch type cannot represent the data at all.
pub type Ticks = i64;

pub const SECONDS_PER_DAY: i64 = 86_400;

/// How much of a date the author actually wrote down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Precision {
    Year,
    Month,
    Day,
    Minute,
    Second,
}

impl Precision {
    pub fn as_str(self) -> &'static str {
        match self {
            Precision::Year => "year",
            Precision::Month => "month",
            Precision::Day => "day",
            Precision::Minute => "minute",
            Precision::Second => "second",
        }
    }
}

/// `?`, `~` or `%`. A qualifier is a display hint; it never moves `start`/`end`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Qualifier {
    Uncertain,
    Approximate,
    UncertainApproximate,
}

impl Qualifier {
    pub fn as_str(self) -> &'static str {
        match self {
            Qualifier::Uncertain => "uncertain",
            Qualifier::Approximate => "approximate",
            Qualifier::UncertainApproximate => "uncertain-approximate",
        }
    }

    fn from_marker(c: char) -> Option<Qualifier> {
        match c {
            '?' => Some(Qualifier::Uncertain),
            '~' => Some(Qualifier::Approximate),
            '%' => Some(Qualifier::UncertainApproximate),
            _ => None,
        }
    }
}

/// A single resolved date and the half-open tick range `[start, end)` it covers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParsedDate {
    pub text: String,
    pub precision: Precision,
    pub qualifier: Option<Qualifier>,
    pub year: i64,
    pub month: Option<i64>,
    pub day: Option<i64>,
    pub hour: Option<i64>,
    pub minute: Option<i64>,
    pub second: Option<i64>,
    pub start: Ticks,
    pub end: Ticks,
}

/// A parsed `When`. `start`/`end` are `None` for the open (`..`) side of an interval.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedWhen {
    pub text: String,
    pub is_interval: bool,
    pub from: Option<ParsedDate>,
    pub to: Option<ParsedDate>,
    pub start: Option<Ticks>,
    pub end: Option<Ticks>,
}

/// A `ParsedWhen` whose open ends have been filled in from the campaign extent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedWhen {
    pub text: String,
    pub is_interval: bool,
    pub from: Option<ParsedDate>,
    pub to: Option<ParsedDate>,
    pub start: Ticks,
    pub end: Ticks,
}

/// The only error `parse_date` / `parse_when` produce. The message text is part of
/// the contract: `test-vectors/time.json` compares it verbatim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhenError(String);

impl WhenError {
    pub fn new(message: impl Into<String>) -> Self {
        WhenError(message.into())
    }
    pub fn message(&self) -> &str {
        &self.0
    }
    pub fn into_message(self) -> String {
        self.0
    }
}

impl fmt::Display for WhenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for WhenError {}

/// Floor division. JS `Math.floor(a / b)` floors towards −∞ while Rust's `/`
/// truncates towards zero, and every date before 1970 takes the negative branch.
#[inline]
fn fdiv(a: i64, b: i64) -> i64 {
    let q = a / b;
    if a % b != 0 && ((a < 0) != (b < 0)) {
        q - 1
    } else {
        q
    }
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = fdiv(y, 400);
    let yoe = y - era * 400; // [0, 399]
    let mp = (month + 9) % 12; // March-based month, [0, 11] for month in [1, 12]
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of [`days_from_civil`]. Returns `(year, month, day)`.
pub fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = fdiv(z, 146_097);
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { y + 1 } else { y }, month, day)
}

pub fn is_leap_year(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

pub fn days_in_month(y: i64, m: i64) -> i64 {
    const LENGTHS: [i64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if m == 2 {
        if is_leap_year(y) {
            29
        } else {
            28
        }
    } else if (1..=12).contains(&m) {
        LENGTHS[(m - 1) as usize]
    } else {
        // Unreachable: the month range check runs first. Mirrors JS `undefined`
        // comparing false, i.e. "no day can exist here".
        0
    }
}

/// The captures of `DATE_RE`, hand-rolled because the crate has no regex dependency.
///
/// `^(-?)(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?)?)?([?~%])?$`
struct DateCaptures<'a> {
    negative: bool,
    year: &'a str,
    month: Option<&'a str>,
    day: Option<&'a str>,
    hour: Option<&'a str>,
    minute: Option<&'a str>,
    second: Option<&'a str>,
    qualifier: Option<char>,
}

fn two_digits(b: &[u8], at: usize) -> bool {
    at + 2 <= b.len() && b[at].is_ascii_digit() && b[at + 1].is_ascii_digit()
}

/// Every optional group in `DATE_RE` is introduced by a character (`-`, `T`, `:`) that
/// cannot start any later group, so a single greedy pass is equivalent to the regex
/// engine's backtracking.
fn match_date(text: &str) -> Option<DateCaptures<'_>> {
    let b = text.as_bytes();
    let mut i = 0usize;

    let negative = if b.first() == Some(&b'-') {
        i = 1;
        true
    } else {
        false
    };

    if i + 4 > b.len() || !b[i..i + 4].iter().all(u8::is_ascii_digit) {
        return None;
    }
    let year = &text[i..i + 4];
    i += 4;

    let (mut month, mut day, mut hour, mut minute, mut second) = (None, None, None, None, None);

    if b.get(i) == Some(&b'-') {
        if !two_digits(b, i + 1) {
            return None;
        }
        month = Some(&text[i + 1..i + 3]);
        i += 3;

        if b.get(i) == Some(&b'-') {
            if !two_digits(b, i + 1) {
                return None;
            }
            day = Some(&text[i + 1..i + 3]);
            i += 3;

            if b.get(i) == Some(&b'T') {
                if !two_digits(b, i + 1) || b.get(i + 3) != Some(&b':') || !two_digits(b, i + 4) {
                    return None;
                }
                hour = Some(&text[i + 1..i + 3]);
                minute = Some(&text[i + 4..i + 6]);
                i += 6;

                if b.get(i) == Some(&b':') {
                    if !two_digits(b, i + 1) {
                        return None;
                    }
                    second = Some(&text[i + 1..i + 3]);
                    i += 3;
                }
            }
        }
    }

    let qualifier = match b.get(i) {
        Some(&c) if c == b'?' || c == b'~' || c == b'%' => {
            i += 1;
            Some(c as char)
        }
        _ => None,
    };

    if i != b.len() {
        return None;
    }
    Some(DateCaptures {
        negative,
        year,
        month,
        day,
        hour,
        minute,
        second,
        qualifier,
    })
}

/// Digits only, so the parse cannot fail; kept infallible to avoid noisy `unwrap`s.
fn digits(s: &str) -> i64 {
    s.bytes().fold(0i64, |acc, c| acc * 10 + (c - b'0') as i64)
}

pub fn parse_date(text: &str) -> Result<ParsedDate, WhenError> {
    let m = match match_date(text) {
        Some(m) => m,
        None => {
            return Err(WhenError::new(format!(
                "\"{text}\" is not a valid date (expected YYYY, YYYY-MM, YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS], optional ?~% suffix)"
            )))
        }
    };

    // Astronomical years: 0000 is 1 BCE and there is exactly one of it, so "-0000"
    // would be a second spelling of the same year and is rejected.
    if m.negative && m.year == "0000" {
        return Err(WhenError::new(format!(
            "\"{text}\": -0000 is not allowed; year zero is 0000"
        )));
    }

    let year = if m.negative {
        -digits(m.year)
    } else {
        digits(m.year)
    };
    let month = m.month.map(digits);
    let day = m.day.map(digits);
    let hour = m.hour.map(digits);
    let minute = m.minute.map(digits);
    let second = m.second.map(digits);

    if let Some(mo) = month {
        if !(1..=12).contains(&mo) {
            return Err(WhenError::new(format!(
                "\"{text}\": month {mo} out of range"
            )));
        }
    }
    if let Some(d) = day {
        // `month` is always Some here: the grammar cannot produce a day without one.
        let mo = month.unwrap_or(0);
        if d < 1 || d > days_in_month(year, mo) {
            return Err(WhenError::new(format!(
                "\"{text}\": day {d} does not exist in {year}-{mo:02}"
            )));
        }
    }
    if hour.is_some_and(|h| h > 23) {
        return Err(WhenError::new(format!("\"{text}\": hour out of range")));
    }
    if minute.is_some_and(|mi| mi > 59) {
        return Err(WhenError::new(format!("\"{text}\": minute out of range")));
    }
    if second.is_some_and(|s| s > 59) {
        return Err(WhenError::new(format!("\"{text}\": second out of range")));
    }

    let (precision, start, end) = match (month, day, hour, second) {
        (None, ..) => (
            Precision::Year,
            days_from_civil(year, 1, 1) * SECONDS_PER_DAY,
            days_from_civil(year + 1, 1, 1) * SECONDS_PER_DAY,
        ),
        (Some(mo), None, ..) => (
            Precision::Month,
            days_from_civil(year, mo, 1) * SECONDS_PER_DAY,
            if mo == 12 {
                days_from_civil(year + 1, 1, 1)
            } else {
                days_from_civil(year, mo + 1, 1)
            } * SECONDS_PER_DAY,
        ),
        (Some(mo), Some(d), None, _) => {
            let s = days_from_civil(year, mo, d) * SECONDS_PER_DAY;
            (Precision::Day, s, s + SECONDS_PER_DAY)
        }
        (Some(mo), Some(d), Some(h), None) => {
            let s = days_from_civil(year, mo, d) * SECONDS_PER_DAY
                + h * 3600
                + minute.unwrap_or(0) * 60;
            (Precision::Minute, s, s + 60)
        }
        (Some(mo), Some(d), Some(h), Some(sec)) => {
            let s = days_from_civil(year, mo, d) * SECONDS_PER_DAY
                + h * 3600
                + minute.unwrap_or(0) * 60
                + sec;
            (Precision::Second, s, s + 1)
        }
    };

    Ok(ParsedDate {
        text: text.to_string(),
        precision,
        qualifier: m.qualifier.and_then(Qualifier::from_marker),
        year,
        month,
        day,
        hour,
        minute,
        second,
        start,
        end,
    })
}

pub fn parse_when(text: &str) -> Result<ParsedWhen, WhenError> {
    if text.is_empty() {
        return Err(WhenError::new("when must be a non-empty string"));
    }
    let parts: Vec<&str> = text.split('/').collect();
    if parts.len() > 2 {
        return Err(WhenError::new(format!("\"{text}\": more than one \"/\"")));
    }
    if parts.len() == 1 {
        if text == ".." {
            return Err(WhenError::new("\"..\" is only valid as an interval end"));
        }
        let d = parse_date(text)?;
        return Ok(ParsedWhen {
            text: text.to_string(),
            is_interval: false,
            start: Some(d.start),
            end: Some(d.end),
            from: Some(d.clone()),
            to: Some(d),
        });
    }

    let (a, b) = (parts[0], parts[1]);
    if a == ".." && b == ".." {
        return Err(WhenError::new(format!("\"{text}\": both ends open")));
    }
    if a.is_empty() || b.is_empty() {
        return Err(WhenError::new(format!(
            "\"{text}\": empty (unknown) interval ends are not supported in v1; use \"..\" for open"
        )));
    }
    let from = if a == ".." {
        None
    } else {
        Some(parse_date(a)?)
    };
    let to = if b == ".." {
        None
    } else {
        Some(parse_date(b)?)
    };
    if let (Some(f), Some(t)) = (&from, &to) {
        if t.start < f.start {
            return Err(WhenError::new(format!(
                "\"{text}\": interval ends before it starts"
            )));
        }
    }
    Ok(ParsedWhen {
        text: text.to_string(),
        is_interval: true,
        start: from.as_ref().map(|d| d.start),
        end: to.as_ref().map(|d| d.end),
        from,
        to,
    })
}

/// Replace open ends with the campaign timeline extent.
pub fn resolve_when(w: &ParsedWhen, extent_start: Ticks, extent_end: Ticks) -> ResolvedWhen {
    ResolvedWhen {
        text: w.text.clone(),
        is_interval: w.is_interval,
        from: w.from.clone(),
        to: w.to.clone(),
        start: w.start.unwrap_or(extent_start),
        end: w.end.unwrap_or(extent_end),
    }
}

/// Parse and resolve in one step.
pub fn resolve_when_str(
    text: &str,
    extent_start: Ticks,
    extent_end: Ticks,
) -> Result<ResolvedWhen, WhenError> {
    Ok(resolve_when(&parse_when(text)?, extent_start, extent_end))
}

/// Ticks → ISO-like string (expanded years outside 0000-9999), used by the test vectors.
pub fn ticks_to_iso(ticks: Ticks) -> String {
    let days = fdiv(ticks, SECONDS_PER_DAY);
    let mut rem = ticks - days * SECONDS_PER_DAY; // always in [0, 86400)
    let (year, month, day) = civil_from_days(days);
    let hh = rem / 3600;
    rem -= hh * 3600;
    let mm = rem / 60;
    let ss = rem - mm * 60;
    let y = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else if year < 0 {
        format!("-{:06}", -year)
    } else {
        format!("+{year:06}")
    };
    format!("{y}-{month:02}-{day:02}T{hh:02}:{mm:02}:{ss:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_round_trips() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(ticks_to_iso(0), "1970-01-01T00:00:00");
    }

    #[test]
    fn year_zero_exists_and_minus_zero_does_not() {
        assert_eq!(parse_date("0000").unwrap().year, 0);
        assert_eq!(
            parse_when("-0000").unwrap_err().message(),
            "\"-0000\": -0000 is not allowed; year zero is 0000"
        );
    }

    #[test]
    fn civil_round_trip_across_year_zero() {
        for d in -800_000..-700_000 {
            let (y, m, day) = civil_from_days(d);
            assert_eq!(days_from_civil(y, m, day), d);
        }
    }
}
