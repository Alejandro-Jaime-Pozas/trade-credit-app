import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { processingApi } from '@/lib/api';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function Home() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);

    const handleStartApplication = async () => {
        setIsLoading(true);
        try {
            const application = await processingApi.createAccountApplication();
            // Assuming application object has uuid or id to redirect to
            navigate(`/dashboard/${application.uuid || application.id}`);
        } catch (error) {
            console.error('Failed to create application', error);
            alert("Error al iniciar la solicitud. Por favor intenta de nuevo.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <Card className="max-w-2xl w-full p-8 space-y-8 text-center shadow-lg border-2">
                <div className="space-y-4">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-primary">
                        Sol Bank
                    </h1>
                    <p className="text-xl text-muted-foreground">
                        Hasta $10,000,000 de pesos para tu empresa (promedio de $3,500,000)
                    </p>
                </div>

                <div className="py-6">
                    <Button
                        size="lg"
                        className="w-full text-lg h-16 animate-pulse hover:animate-none"
                        onClick={handleStartApplication}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                                Creando Solicitud...
                            </>
                        ) : (
                            'Conseguir Préstamo'
                        )}
                    </Button>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                        Al obtener toda tu información, nuestro sistema te dará un préstamo en menos de 24 horas.
                    </p>
                    <p>
                        Todo sin dolores de cabeza ni procesos tardados, solo pásanos tus archivos y nuestro sistema se encarga.
                    </p>
                </div>
            </Card>
        </div>
    );
}
