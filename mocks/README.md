# mocks/ — la clave del trabajo en paralelo
Cada módulo tiene aquí una implementación falsa de su contrato.
Regla: si tu módulo aún no existe, los demás consumen tu mock.
Si cambias tu contrato (PR `shared-change`), actualiza tu mock en el mismo PR.
