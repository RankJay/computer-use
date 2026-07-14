//! Non-Windows / non-macOS resolver: PATH lookup only, no `.exe` suffixing.

use crate::capabilities::error::CommandError;

use super::resolver::{as_path_literal, ExecutableResolver, ResolvedExecutable};

pub struct UnsupportedResolver;

impl ExecutableResolver for UnsupportedResolver {
    fn resolve(&self, name: &str) -> Result<ResolvedExecutable, CommandError> {
        if let Some(path) = as_path_literal(name) {
            return Ok(ResolvedExecutable::cli(path));
        }
        Ok(ResolvedExecutable::cli(name.trim().to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_name_not_suffixed_with_exe() {
        let r = UnsupportedResolver;
        assert_eq!(r.resolve("chrome").expect("resolve").path, "chrome");
        assert_eq!(r.resolve("notepad").expect("resolve").path, "notepad");
    }

    #[test]
    fn absolute_path_passes_through() {
        let r = UnsupportedResolver;
        assert_eq!(
            r.resolve("/usr/bin/python3").expect("resolve").path,
            "/usr/bin/python3"
        );
    }
}
