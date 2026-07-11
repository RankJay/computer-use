use crate::capabilities::error::{CommandError, ErrorCode};

/// Resolve a key name to a Windows virtual-key code.
pub fn parse_key(name: &str) -> Result<u16, CommandError> {
    let key = name.trim().to_ascii_lowercase();
    if key.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidKey,
            "Key name must not be empty",
        ));
    }

    let vk = match key.as_str() {
        "ctrl" | "control" => 0x11,       // VK_CONTROL
        "shift" => 0x10,                  // VK_SHIFT
        "alt" => 0x12,                    // VK_MENU
        "win" | "meta" | "super" => 0x5B, // VK_LWIN
        "enter" | "return" => 0x0D,       // VK_RETURN
        "tab" => 0x09,                    // VK_TAB
        "escape" | "esc" => 0x1B,         // VK_ESCAPE
        "space" => 0x20,                  // VK_SPACE
        "backspace" => 0x08,              // VK_BACK
        "delete" | "del" => 0x2E,         // VK_DELETE
        "up" => 0x26,                     // VK_UP
        "down" => 0x28,                   // VK_DOWN
        "left" => 0x25,                   // VK_LEFT
        "right" => 0x27,                  // VK_RIGHT
        "home" => 0x24,                   // VK_HOME
        "end" => 0x23,                    // VK_END
        "pageup" | "pgup" => 0x21,        // VK_PRIOR
        "pagedown" | "pgdn" => 0x22,      // VK_NEXT
        "insert" | "ins" => 0x2D,         // VK_INSERT
        "capslock" => 0x14,               // VK_CAPITAL
        "f1" => 0x70,
        "f2" => 0x71,
        "f3" => 0x72,
        "f4" => 0x73,
        "f5" => 0x74,
        "f6" => 0x75,
        "f7" => 0x76,
        "f8" => 0x77,
        "f9" => 0x78,
        "f10" => 0x79,
        "f11" => 0x7A,
        "f12" => 0x7B,
        // US-layout OEM punctuation (names + single-char forms)
        "slash" | "/" => 0xBF,                     // VK_OEM_2
        "backslash" | "\\" => 0xDC,                // VK_OEM_5
        "period" | "dot" | "." => 0xBE,            // VK_OEM_PERIOD
        "comma" | "," => 0xBC,                     // VK_OEM_COMMA
        "minus" | "dash" | "hyphen" | "-" => 0xBD, // VK_OEM_MINUS
        "equals" | "equal" | "=" => 0xBB,          // VK_OEM_PLUS
        "semicolon" | ";" => 0xBA,                 // VK_OEM_1
        "quote" | "apostrophe" | "'" => 0xDE,      // VK_OEM_7
        "backtick" | "`" => 0xC0,                  // VK_OEM_3
        "lbracket" | "[" => 0xDB,                  // VK_OEM_4
        "rbracket" | "]" => 0xDD,                  // VK_OEM_6
        other if other.len() == 1 => {
            let ch = other.chars().next().expect("len checked");
            match ch {
                'a'..='z' => (ch as u8 - b'a' + 0x41) as u16, // VK_A..VK_Z
                '0'..='9' => (ch as u8) as u16,               // VK_0..VK_9
                _ => {
                    return Err(CommandError::new(
                        ErrorCode::InvalidKey,
                        format!("Unsupported key: {name}"),
                    ));
                }
            }
        }
        _ => {
            return Err(CommandError::new(
                ErrorCode::InvalidKey,
                format!("Unsupported key: {name}"),
            ));
        }
    };

    Ok(vk)
}

/// Parse an ordered list of key names into virtual-key codes.
pub fn parse_keys(names: &[String]) -> Result<Vec<u16>, CommandError> {
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
        assert_eq!(parse_key("ctrl").unwrap(), 0x11);
        assert_eq!(parse_key("CONTROL").unwrap(), 0x11);
        assert_eq!(parse_key("c").unwrap(), 0x43);
        assert_eq!(parse_key("Win").unwrap(), 0x5B);
        assert_eq!(parse_key("f4").unwrap(), 0x73);
        assert_eq!(parse_key("escape").unwrap(), 0x1B);
        assert_eq!(parse_key("esc").unwrap(), 0x1B);
        assert_eq!(parse_key("slash").unwrap(), 0xBF);
        assert_eq!(parse_key("/").unwrap(), 0xBF);
        assert_eq!(parse_key("comma").unwrap(), 0xBC);
        assert_eq!(parse_key(".").unwrap(), 0xBE);
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
        assert_eq!(keys, vec![0x11, 0x43]);
    }
}
