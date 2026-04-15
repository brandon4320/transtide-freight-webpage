import DevicePreview from "@/components/device-preview"

export default function TestMobilePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-primary-800 mb-6">Test de Experiencia Móvil</h1>
      <p className="text-gray-600 mb-8">
        Utiliza esta herramienta para verificar cómo se ve y funciona el sitio web en diferentes dispositivos móviles.
        Puedes cambiar entre dispositivos y realizar verificaciones de elementos clave.
      </p>

      <DevicePreview />

      <div className="mt-8 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
          <h2 className="text-xl font-bold text-primary-800 mb-4">Guía de Verificación</h2>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-primary-700 mb-2">1. Diseño Responsive</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Verificar que el texto sea legible en todos los tamaños de pantalla</li>
                <li>Comprobar que los márgenes y paddings sean adecuados</li>
                <li>Asegurar que no haya desbordamiento horizontal</li>
                <li>Verificar que las imágenes se escalen correctamente</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-primary-700 mb-2">2. Navegación</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Probar el menú hamburguesa en dispositivos móviles</li>
                <li>Verificar que los enlaces sean fáciles de tocar</li>
                <li>Comprobar que la navegación sea intuitiva</li>
                <li>Asegurar que el header se comporte correctamente al hacer scroll</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-primary-700 mb-2">3. Interacción</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Verificar que los botones tengan un tamaño mínimo de 44px</li>
                <li>Comprobar que los formularios sean fáciles de completar</li>
                <li>Asegurar que los elementos interactivos tengan feedback visual</li>
                <li>Verificar que las animaciones sean suaves y no afecten el rendimiento</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-primary-700 mb-2">4. Rendimiento</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Verificar la velocidad de carga en conexiones lentas</li>
                <li>Comprobar que las imágenes se carguen correctamente con lazy loading</li>
                <li>Asegurar que las animaciones no causen jank visual</li>
                <li>Verificar que el sitio sea utilizable durante la carga</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
          <h2 className="text-xl font-bold text-primary-800 mb-4">Dispositivos Recomendados para Pruebas</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="font-semibold text-primary-700">Dispositivos Pequeños</h3>
              <p className="text-sm text-gray-600 mb-2">320px - 375px</p>
              <ul className="text-sm text-gray-700">
                <li>iPhone SE (1st gen)</li>
                <li>Galaxy S5</li>
                <li>Dispositivos de gama baja</li>
              </ul>
            </div>

            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="font-semibold text-primary-700">Dispositivos Medianos</h3>
              <p className="text-sm text-gray-600 mb-2">376px - 428px</p>
              <ul className="text-sm text-gray-700">
                <li>iPhone 12/13/14</li>
                <li>Samsung Galaxy S21/S22</li>
                <li>Google Pixel 6</li>
              </ul>
            </div>

            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="font-semibold text-primary-700">Tablets</h3>
              <p className="text-sm text-gray-600 mb-2">768px - 1024px</p>
              <ul className="text-sm text-gray-700">
                <li>iPad Mini</li>
                <li>iPad Air/Pro</li>
                <li>Samsung Galaxy Tab</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
