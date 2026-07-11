use crate::capabilities::error::{CommandError, ErrorCode};

/// Platform-neutral key identity. Name parsing stays here; OS codes live in adapters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Key {
    Ctrl,
    Shift,
    Alt,
    Win,
    Enter,
    Tab,
    Escape,
    Space,
    Backspace,
    Delete,
    Up,
    Down,
    Left,
    Right,
    Home,
    End,
    PageUp,
    PageDown,
    Insert,
    CapsLock,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    Digit0,
    Digit1,
    Digit2,
    Digit3,
    Digit4,
    Digit5,
    Digit6,
    Digit7,
    Digit8,
    Digit9,
    Slash,
    Backslash,
    Period,
    Comma,
    Minus,
    Equals,
    Semicolon,
    Quote,
    Backtick,
    LBracket,
    RBracket,
}

impl Key {
    /// Same accepted spellings as the former `parse_key` table.
    pub fn from_name(name: &str) -> Option<Key> {
        let key = name.trim().to_ascii_lowercase();
        if key.is_empty() {
            return None;
        }

        Some(match key.as_str() {
            "ctrl" | "control" => Key::Ctrl,
            "shift" => Key::Shift,
            "alt" => Key::Alt,
            "win" | "meta" | "super" => Key::Win,
            "enter" | "return" => Key::Enter,
            "tab" => Key::Tab,
            "escape" | "esc" => Key::Escape,
            "space" => Key::Space,
            "backspace" => Key::Backspace,
            "delete" | "del" => Key::Delete,
            "up" => Key::Up,
            "down" => Key::Down,
            "left" => Key::Left,
            "right" => Key::Right,
            "home" => Key::Home,
            "end" => Key::End,
            "pageup" | "pgup" => Key::PageUp,
            "pagedown" | "pgdn" => Key::PageDown,
            "insert" | "ins" => Key::Insert,
            "capslock" => Key::CapsLock,
            "f1" => Key::F1,
            "f2" => Key::F2,
            "f3" => Key::F3,
            "f4" => Key::F4,
            "f5" => Key::F5,
            "f6" => Key::F6,
            "f7" => Key::F7,
            "f8" => Key::F8,
            "f9" => Key::F9,
            "f10" => Key::F10,
            "f11" => Key::F11,
            "f12" => Key::F12,
            "slash" | "/" => Key::Slash,
            "backslash" | "\\" => Key::Backslash,
            "period" | "dot" | "." => Key::Period,
            "comma" | "," => Key::Comma,
            "minus" | "dash" | "hyphen" | "-" => Key::Minus,
            "equals" | "equal" | "=" => Key::Equals,
            "semicolon" | ";" => Key::Semicolon,
            "quote" | "apostrophe" | "'" => Key::Quote,
            "backtick" | "`" => Key::Backtick,
            "lbracket" | "[" => Key::LBracket,
            "rbracket" | "]" => Key::RBracket,
            other if other.len() == 1 => {
                let ch = other.chars().next().expect("len checked");
                match ch {
                    'a'..='z' => letter_key(ch),
                    '0'..='9' => digit_key(ch),
                    _ => return None,
                }
            }
            _ => return None,
        })
    }
}

fn letter_key(ch: char) -> Key {
    match ch {
        'a' => Key::A,
        'b' => Key::B,
        'c' => Key::C,
        'd' => Key::D,
        'e' => Key::E,
        'f' => Key::F,
        'g' => Key::G,
        'h' => Key::H,
        'i' => Key::I,
        'j' => Key::J,
        'k' => Key::K,
        'l' => Key::L,
        'm' => Key::M,
        'n' => Key::N,
        'o' => Key::O,
        'p' => Key::P,
        'q' => Key::Q,
        'r' => Key::R,
        's' => Key::S,
        't' => Key::T,
        'u' => Key::U,
        'v' => Key::V,
        'w' => Key::W,
        'x' => Key::X,
        'y' => Key::Y,
        'z' => Key::Z,
        _ => unreachable!("caller checks a..=z"),
    }
}

fn digit_key(ch: char) -> Key {
    match ch {
        '0' => Key::Digit0,
        '1' => Key::Digit1,
        '2' => Key::Digit2,
        '3' => Key::Digit3,
        '4' => Key::Digit4,
        '5' => Key::Digit5,
        '6' => Key::Digit6,
        '7' => Key::Digit7,
        '8' => Key::Digit8,
        '9' => Key::Digit9,
        _ => unreachable!("caller checks 0..=9"),
    }
}

/// Resolve a key name with the same error codes/messages as before.
pub fn parse_key(name: &str) -> Result<Key, CommandError> {
    if name.trim().is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidKey,
            "Key name must not be empty",
        ));
    }
    Key::from_name(name)
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidKey, format!("Unsupported key: {name}")))
}

/// Parse an ordered list of key names.
pub fn parse_keys(names: &[String]) -> Result<Vec<Key>, CommandError> {
    if names.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidKeys,
            "At least one key is required",
        ));
    }
    names.iter().map(|name| parse_key(name)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modifiers_and_letters() {
        assert_eq!(Key::from_name("ctrl"), Some(Key::Ctrl));
        assert_eq!(Key::from_name("CONTROL"), Some(Key::Ctrl));
        assert_eq!(Key::from_name("c"), Some(Key::C));
        assert_eq!(Key::from_name("Win"), Some(Key::Win));
        assert_eq!(Key::from_name("f4"), Some(Key::F4));
        assert_eq!(Key::from_name("escape"), Some(Key::Escape));
        assert_eq!(Key::from_name("esc"), Some(Key::Escape));
        assert_eq!(Key::from_name("slash"), Some(Key::Slash));
        assert_eq!(Key::from_name("/"), Some(Key::Slash));
        assert_eq!(Key::from_name("comma"), Some(Key::Comma));
        assert_eq!(Key::from_name("."), Some(Key::Period));
    }

    #[test]
    fn rejects_unknown_keys() {
        let error = parse_key("semicolonish").expect_err("unknown");
        assert_eq!(error.code, "invalid_key");
        let empty = parse_key("  ").expect_err("empty");
        assert_eq!(empty.code, "invalid_key");
    }

    #[test]
    fn parse_keys_requires_non_empty() {
        let error = parse_keys(&[]).expect_err("empty");
        assert_eq!(error.code, "invalid_keys");
        let keys = parse_keys(&["ctrl".into(), "c".into()]).unwrap();
        assert_eq!(keys, vec![Key::Ctrl, Key::C]);
    }
}
