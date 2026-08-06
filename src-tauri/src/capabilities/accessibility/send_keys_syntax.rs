//! UIA / WinForms-style SendKeys dialect shared by the agent contract.
//!
//! On macOS, `^` is the platform primary shortcut modifier (Command), matching
//! tool docs (`^v` → Cmd+V). On Windows, `^` is Ctrl. Playback uses the input
//! synthesizer (Unicode text + named keys) so Chromium focus quirks do not
//! depend on UIA SendKeys.

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::input::keys::Key;
use crate::capabilities::input::synthesizer;

/// Play the agent SendKeys dialect (`^v`, `{ENTER}`, plain text, …) via the input synthesizer.
pub(super) fn play_send_keys(text: &str) -> Result<(), CommandError> {
    let segments = parse_send_keys(text)?;
    let synth = synthesizer();
    for segment in segments {
        match segment {
            Segment::Text(run) => {
                synth
                    .type_text(&run)
                    .map_err(|error| CommandError::new(ErrorCode::SendKeysFailed, error.message))?;
            }
            Segment::Press { key, count } => {
                synth
                    .key_press(key, count)
                    .map_err(|error| CommandError::new(ErrorCode::SendKeysFailed, error.message))?;
            }
            Segment::Chord { modifiers, keys } => {
                for modifier in &modifiers {
                    synth.key_down(*modifier).map_err(|error| {
                        CommandError::new(ErrorCode::SendKeysFailed, error.message)
                    })?;
                }
                for key in &keys {
                    synth.key_press(*key, 1).map_err(|error| {
                        CommandError::new(ErrorCode::SendKeysFailed, error.message)
                    })?;
                }
                for modifier in modifiers.iter().rev() {
                    synth.key_up(*modifier).map_err(|error| {
                        CommandError::new(ErrorCode::SendKeysFailed, error.message)
                    })?;
                }
            }
        }
    }
    Ok(())
}

/// One playable unit after parsing a SendKeys string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Segment {
    /// Literal characters — prefer Unicode injection over layout-sensitive keys.
    Text(String),
    /// Named / braced key, optionally repeated (`{TAB 3}`).
    Press { key: Key, count: u32 },
    /// Modifiers held while each key is pressed (`^v`, `+(ab)`).
    Chord { modifiers: Vec<Key>, keys: Vec<Key> },
}

/// Parse a SendKeys string into segments. Does not post events.
pub fn parse_send_keys(input: &str) -> Result<Vec<Segment>, CommandError> {
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    let mut out: Vec<Segment> = Vec::new();
    let mut text_buf = String::new();

    let flush_text = |buf: &mut String, out: &mut Vec<Segment>| {
        if !buf.is_empty() {
            out.push(Segment::Text(std::mem::take(buf)));
        }
    };

    while i < chars.len() {
        match chars[i] {
            '^' | '+' | '%' => {
                flush_text(&mut text_buf, &mut out);
                let mut modifiers = Vec::new();
                while i < chars.len() {
                    match chars[i] {
                        '^' => {
                            modifiers.push(primary_shortcut_modifier());
                            i += 1;
                        }
                        '+' => {
                            modifiers.push(Key::Shift);
                            i += 1;
                        }
                        '%' => {
                            modifiers.push(Key::Alt);
                            i += 1;
                        }
                        _ => break,
                    }
                }
                if modifiers.is_empty() {
                    return Err(invalid("expected modifier"));
                }
                if i >= chars.len() {
                    return Err(invalid("modifier without a following key"));
                }

                if chars[i] == '(' {
                    i += 1;
                    let mut keys = Vec::new();
                    while i < chars.len() && chars[i] != ')' {
                        let (key, next) = parse_key_atom(&chars, i)?;
                        keys.push(key);
                        i = next;
                    }
                    if i >= chars.len() || chars[i] != ')' {
                        return Err(invalid("unclosed modifier group '('"));
                    }
                    i += 1;
                    if keys.is_empty() {
                        return Err(invalid("empty modifier group"));
                    }
                    out.push(Segment::Chord { modifiers, keys });
                } else {
                    let (key, next) = parse_key_atom(&chars, i)?;
                    i = next;
                    out.push(Segment::Chord {
                        modifiers,
                        keys: vec![key],
                    });
                }
            }
            '~' => {
                flush_text(&mut text_buf, &mut out);
                out.push(Segment::Press {
                    key: Key::Enter,
                    count: 1,
                });
                i += 1;
            }
            '{' => {
                flush_text(&mut text_buf, &mut out);
                let (segment, next) = parse_brace(&chars, i)?;
                out.push(segment);
                i = next;
            }
            ch => {
                text_buf.push(ch);
                i += 1;
            }
        }
    }

    flush_text(&mut text_buf, &mut out);
    if out.is_empty() {
        return Err(invalid("send_keys text produced no keystrokes"));
    }
    Ok(out)
}

/// `^` → Command on macOS, Ctrl elsewhere (matches tool description).
fn primary_shortcut_modifier() -> Key {
    #[cfg(target_os = "macos")]
    {
        Key::Win
    }
    #[cfg(not(target_os = "macos"))]
    {
        Key::Ctrl
    }
}

fn parse_key_atom(chars: &[char], start: usize) -> Result<(Key, usize), CommandError> {
    if start >= chars.len() {
        return Err(invalid("expected a key"));
    }
    if chars[start] == '{' {
        let (segment, next) = parse_brace(chars, start)?;
        match segment {
            Segment::Press { key, count } if count == 1 => Ok((key, next)),
            Segment::Press { .. } => Err(invalid("repeat count is not valid inside a chord")),
            Segment::Text(text) if text.chars().count() == 1 => {
                let ch = text.chars().next().expect("len checked");
                char_to_key(ch)
                    .map(|key| (key, next))
                    .ok_or_else(|| invalid(&format!("cannot chord literal '{text}'")))
            }
            _ => Err(invalid("expected a single key after modifier")),
        }
    } else {
        let ch = chars[start];
        let key = char_to_key(ch)
            .ok_or_else(|| invalid(&format!("unsupported key character '{ch}' after modifier")))?;
        Ok((key, start + 1))
    }
}

fn parse_brace(chars: &[char], start: usize) -> Result<(Segment, usize), CommandError> {
    if start >= chars.len() || chars[start] != '{' {
        return Err(invalid("expected '{'"));
    }
    let mut i = start + 1;
    if i >= chars.len() {
        return Err(invalid("unclosed '{'"));
    }

    // Escaped single specials: {+}, {^}, {%}, {~}, {(}, {)}, {{}, {}}
    if matches!(chars[i], '+' | '^' | '%' | '~' | '(' | ')' | '{' | '}') {
        let lit = chars[i];
        i += 1;
        if i >= chars.len() || chars[i] != '}' {
            return Err(invalid(&format!("expected '}}' after '{{{lit}'")));
        }
        return Ok((Segment::Text(lit.to_string()), i + 1));
    }

    let content_start = i;
    while i < chars.len() && chars[i] != '}' {
        i += 1;
    }
    if i >= chars.len() {
        return Err(invalid("unclosed '{'"));
    }
    let content: String = chars[content_start..i].iter().collect();
    i += 1; // skip '}'

    let (name, count) = split_brace_name_count(&content)?;
    let key = named_key(name).ok_or_else(|| invalid(&format!("unknown key '{{{content}}}'")))?;
    Ok((Segment::Press { key, count }, i))
}

fn split_brace_name_count(content: &str) -> Result<(&str, u32), CommandError> {
    let content = content.trim();
    if content.is_empty() {
        return Err(invalid("empty braces"));
    }
    if let Some((name, rest)) = content.split_once(char::is_whitespace) {
        let count: u32 = rest
            .trim()
            .parse()
            .map_err(|_| invalid(&format!("invalid repeat count in '{{{content}}}'")))?;
        if count == 0 {
            return Err(invalid("repeat count must be >= 1"));
        }
        Ok((name, count))
    } else {
        Ok((content, 1))
    }
}

fn named_key(name: &str) -> Option<Key> {
    match name.trim().to_ascii_uppercase().as_str() {
        "ENTER" | "RETURN" => Some(Key::Enter),
        "TAB" => Some(Key::Tab),
        "ESC" | "ESCAPE" => Some(Key::Escape),
        "BACKSPACE" | "BS" | "BKSP" => Some(Key::Backspace),
        "DELETE" | "DEL" => Some(Key::Delete),
        "UP" => Some(Key::Up),
        "DOWN" => Some(Key::Down),
        "LEFT" => Some(Key::Left),
        "RIGHT" => Some(Key::Right),
        "HOME" => Some(Key::Home),
        "END" => Some(Key::End),
        "PGUP" | "PAGEUP" => Some(Key::PageUp),
        "PGDN" | "PAGEDOWN" => Some(Key::PageDown),
        "INSERT" | "INS" => Some(Key::Insert),
        "CAPSLOCK" => Some(Key::CapsLock),
        "SPACE" => Some(Key::Space),
        "F1" => Some(Key::F1),
        "F2" => Some(Key::F2),
        "F3" => Some(Key::F3),
        "F4" => Some(Key::F4),
        "F5" => Some(Key::F5),
        "F6" => Some(Key::F6),
        "F7" => Some(Key::F7),
        "F8" => Some(Key::F8),
        "F9" => Some(Key::F9),
        "F10" => Some(Key::F10),
        "F11" => Some(Key::F11),
        "F12" => Some(Key::F12),
        other if other.len() == 1 => char_to_key(other.chars().next()?),
        _ => None,
    }
}

fn char_to_key(ch: char) -> Option<Key> {
    let lower = ch.to_ascii_lowercase();
    match lower {
        'a'..='z' | '0'..='9' => Key::from_name(&lower.to_string()),
        '/' => Some(Key::Slash),
        '\\' => Some(Key::Backslash),
        '.' => Some(Key::Period),
        ',' => Some(Key::Comma),
        '-' => Some(Key::Minus),
        '=' => Some(Key::Equals),
        ';' => Some(Key::Semicolon),
        '\'' => Some(Key::Quote),
        '`' => Some(Key::Backtick),
        '[' => Some(Key::LBracket),
        ']' => Some(Key::RBracket),
        ' ' => Some(Key::Space),
        _ => None,
    }
}

fn invalid(message: &str) -> CommandError {
    CommandError::new(
        ErrorCode::InvalidInput,
        format!("Invalid send_keys sequence: {message}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_text() {
        assert_eq!(
            parse_send_keys("hello").unwrap(),
            vec![Segment::Text("hello".into())]
        );
    }

    #[test]
    fn parses_enter_aliases() {
        assert_eq!(
            parse_send_keys("{ENTER}").unwrap(),
            vec![Segment::Press {
                key: Key::Enter,
                count: 1
            }]
        );
        assert_eq!(
            parse_send_keys("~").unwrap(),
            vec![Segment::Press {
                key: Key::Enter,
                count: 1
            }]
        );
    }

    #[test]
    fn parses_caret_v_as_primary_chord() {
        let segments = parse_send_keys("^v").unwrap();
        assert_eq!(
            segments,
            vec![Segment::Chord {
                modifiers: vec![primary_shortcut_modifier()],
                keys: vec![Key::V],
            }]
        );
    }

    #[test]
    fn parses_mixed_text_and_enter() {
        assert_eq!(
            parse_send_keys("hi{ENTER}").unwrap(),
            vec![
                Segment::Text("hi".into()),
                Segment::Press {
                    key: Key::Enter,
                    count: 1
                },
            ]
        );
    }

    #[test]
    fn parses_shift_group_and_repeat() {
        assert_eq!(
            parse_send_keys("+(ab)").unwrap(),
            vec![Segment::Chord {
                modifiers: vec![Key::Shift],
                keys: vec![Key::A, Key::B],
            }]
        );
        assert_eq!(
            parse_send_keys("{TAB 3}").unwrap(),
            vec![Segment::Press {
                key: Key::Tab,
                count: 3
            }]
        );
    }

    #[test]
    fn parses_literal_specials() {
        assert_eq!(
            parse_send_keys("{^}{+}").unwrap(),
            vec![Segment::Text("^".into()), Segment::Text("+".into())]
        );
    }

    #[test]
    fn rejects_dangling_modifier() {
        assert!(parse_send_keys("^").is_err());
        assert!(parse_send_keys("{NOPE}").is_err());
    }
}
