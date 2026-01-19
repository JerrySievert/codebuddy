'use strict';

/**
 * @fileoverview Language-specific inheritance extraction handlers.
 * Each handler extracts inheritance relationships from class/struct nodes.
 * @module lib/inheritance/handlers
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract type identifiers from a node recursively.
 * Filters out common keywords.
 * @param {Object} node - Tree-sitter node
 * @returns {string[]} Array of type names
 */
const extract_type_names = (node) => {
  const names = [];
  const traverse = (n) => {
    if (!n) return;
    if (
      n.type === 'type_identifier' ||
      n.type === 'identifier' ||
      n.type === 'name' ||
      n.type === 'constant'
    ) {
      const text = n.text;
      if (
        text &&
        ![
          'extends',
          'implements',
          'public',
          'private',
          'protected',
          'virtual'
        ].includes(text)
      ) {
        names.push(text);
      }
    }
    for (let i = 0; i < n.childCount; i++) {
      traverse(n.child(i));
    }
  };
  traverse(node);
  return names;
};

/**
 * Find child nodes of a specific type and extract inheritance relationships.
 * @param {Object} class_node - The class/struct node
 * @param {string} child_type - Type of child node to find
 * @param {string} relationship_type - 'extends' or 'implements'
 * @returns {Object[]} Array of relationship objects
 */
const extract_from_child_type = (class_node, child_type, relationship_type) => {
  const relationships = [];
  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (child.type === child_type) {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type
        });
      }
    }
  }
  return relationships;
};

// ============================================================================
// Language-Specific Handlers
// ============================================================================

/**
 * Extract inheritance for Java classes.
 * Java uses superclass for extends and super_interfaces for implements.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_java = (class_node) => {
  const relationships = [];

  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (child.type === 'superclass') {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: 'extends'
        });
      }
    } else if (child.type === 'super_interfaces') {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: 'implements'
        });
      }
    }
  }

  return relationships;
};

/**
 * Extract inheritance for TypeScript/JavaScript classes.
 * Uses class_heritage with extends_clause and implements_clause.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_typescript = (class_node) => {
  const relationships = [];

  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (child.type === 'class_heritage') {
      for (let j = 0; j < child.childCount; j++) {
        const heritage_child = child.child(j);
        if (heritage_child.type === 'extends_clause') {
          const types = extract_type_names(heritage_child);
          for (const t of types) {
            relationships.push({
              parent_symbol: t,
              relationship_type: 'extends'
            });
          }
        } else if (heritage_child.type === 'implements_clause') {
          const types = extract_type_names(heritage_child);
          for (const t of types) {
            relationships.push({
              parent_symbol: t,
              relationship_type: 'implements'
            });
          }
        }
      }
    }
    // For interface extends
    if (
      child.type === 'extends_type_clause' ||
      child.type === 'extends_clause'
    ) {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: 'extends'
        });
      }
    }
  }

  return relationships;
};

/**
 * Extract inheritance for Python classes.
 * Base classes are in argument_list directly after class name.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_python = (class_node) => {
  const relationships = [];

  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (child.type === 'argument_list') {
      const types = extract_type_names(child);
      for (const t of types) {
        // Skip common non-class arguments like metaclass=...
        if (!t.includes('=')) {
          relationships.push({
            parent_symbol: t,
            relationship_type: 'extends'
          });
        }
      }
    }
  }

  return relationships;
};

/**
 * Extract inheritance for C# classes.
 * Uses base_list for both base class and interfaces.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_csharp = (class_node) => {
  const relationships = [];

  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (child.type === 'base_list') {
      const types = extract_type_names(child);
      // In C#, we can't easily distinguish base class from interfaces
      const is_interface = class_node.type === 'interface_declaration';
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: is_interface ? 'extends' : 'implements'
        });
      }
    }
  }

  return relationships;
};

/**
 * Extract inheritance for C++ classes.
 * Uses base_class_clause.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_cpp = (class_node) => {
  return extract_from_child_type(class_node, 'base_class_clause', 'extends');
};

/**
 * Extract inheritance for Rust.
 * impl_item for trait implementations.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_rust = (class_node) => {
  const relationships = [];

  if (class_node.type === 'impl_item') {
    // Look for "for" keyword which indicates impl Trait for Type
    let trait_name = null;
    let found_for = false;

    for (let i = 0; i < class_node.childCount; i++) {
      const child = class_node.child(i);
      if (
        child.type === 'type_identifier' ||
        child.type === 'generic_type'
      ) {
        if (!found_for) {
          trait_name = child.text;
        }
      }
      if (child.text === 'for') {
        found_for = true;
      }
    }

    if (trait_name && found_for) {
      relationships.push({
        parent_symbol: trait_name,
        relationship_type: 'implements'
      });
    }
  }

  return relationships;
};

/**
 * Extract inheritance for Swift.
 * Uses inheritance_clause or type_inheritance_clause.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_swift = (class_node) => {
  const relationships = [];

  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (
      child.type === 'inheritance_clause' ||
      child.type === 'type_inheritance_clause'
    ) {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: 'extends'
        });
      }
    }
  }

  return relationships;
};

/**
 * Extract inheritance for Ruby.
 * Uses superclass child.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_ruby = (class_node) => {
  return extract_from_child_type(class_node, 'superclass', 'extends');
};

/**
 * Extract inheritance for PHP.
 * Uses base_clause for extends and class_interface_clause for implements.
 * @param {Object} class_node - The class node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_php = (class_node) => {
  const relationships = [];

  for (let i = 0; i < class_node.childCount; i++) {
    const child = class_node.child(i);
    if (child.type === 'base_clause') {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: 'extends'
        });
      }
    } else if (child.type === 'class_interface_clause') {
      const types = extract_type_names(child);
      for (const t of types) {
        relationships.push({
          parent_symbol: t,
          relationship_type: 'implements'
        });
      }
    }
  }

  return relationships;
};

/**
 * Extract inheritance for Go.
 * Uses struct embedding via anonymous field declarations.
 * @param {Object} class_node - The struct node
 * @returns {Object[]} Array of inheritance relationships
 */
const handle_go = (class_node) => {
  const relationships = [];

  if (class_node.type === 'struct_type') {
    for (let i = 0; i < class_node.childCount; i++) {
      const child = class_node.child(i);
      if (child.type === 'field_declaration_list') {
        for (let j = 0; j < child.childCount; j++) {
          const field = child.child(j);
          if (field.type === 'field_declaration') {
            // Anonymous field (embedding) has type but no name
            const has_name = field.children.some(
              (c) => c.type === 'field_identifier'
            );
            if (!has_name) {
              const types = extract_type_names(field);
              for (const t of types) {
                relationships.push({
                  parent_symbol: t,
                  relationship_type: 'embeds'
                });
              }
            }
          }
        }
      }
    }
  }

  return relationships;
};

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Map of language identifiers to their inheritance extraction handlers.
 */
const INHERITANCE_HANDLERS = {
  java: handle_java,
  typescript: handle_typescript,
  tsx: handle_typescript,
  javascript: handle_typescript,
  python: handle_python,
  csharp: handle_csharp,
  cpp: handle_cpp,
  rust: handle_rust,
  swift: handle_swift,
  ruby: handle_ruby,
  php: handle_php,
  go: handle_go
};

/**
 * Get the inheritance extraction handler for a language.
 * @param {string} language - Language identifier
 * @returns {Function|null} Handler function or null if not supported
 */
const get_inheritance_handler = (language) => {
  return INHERITANCE_HANDLERS[language] || null;
};

export {
  extract_type_names,
  extract_from_child_type,
  get_inheritance_handler,
  handle_java,
  handle_typescript,
  handle_python,
  handle_csharp,
  handle_cpp,
  handle_rust,
  handle_swift,
  handle_ruby,
  handle_php,
  handle_go
};
